interface DataPoint {
    timestamp: Date;
    value: number;
    category: string;
    metadata: Record<string, any>;
}

interface ProcessingOptions {
    batchSize?: number;
    parallelProcessing?: boolean;
    retryAttempts?: number;
    validationRules?: ValidationRule[];
}

interface ValidationRule {
    field: keyof DataPoint;
    validator: (value: any) => boolean;
    errorMessage: string;
}

interface ProcessingResult {
    success: boolean;
    processedCount: number;
    errors: ProcessingError[];
    duration: number;
}

interface ProcessingError {
    dataPoint: DataPoint;
    message: string;
    timestamp: Date;
}

interface DataAnalysis {
    category: string;
    count: number;
    average: number;
    median: number;
    min: number;
    max: number;
    standardDeviation: number;
}

class DataProcessor {
    private batchManager: BatchManager;
    private dataValidator: DataValidator;
    private transformationPipeline: TransformationPipeline;

    constructor(config: ProcessorConfig) {
        this.initializeBatchProcessing(config);
        this.setupValidation(config);
        this.createTransformationPipeline(config);
    }

    private initializeBatchProcessing(config: ProcessorConfig): void {
        this.batchManager = new BatchManager({
            maxBatchSize: config.batchSize || 1000,
            processingTimeout: config.timeout || 30000,
            retryStrategy: config.retryStrategy || 'exponential',
            maxRetries: config.maxRetries || 3,
            workers: config.workerCount || 4
        });

        this.setupBatchHandlers();
    }

    private setupBatchHandlers(): void {
        this.batchManager.on('batchComplete', this.handleBatchComplete.bind(this));
        this.batchManager.on('batchError', this.handleBatchError.bind(this));
        this.batchManager.on('workerError', this.handleWorkerError.bind(this));
        this.batchManager.on('queueFull', this.handleQueueFull.bind(this));
    }

    private async handleBatchComplete(result: BatchResult): Promise<void> {
        await this.metrics.recordBatchMetrics(result);
        await this.storage.storeBatchResult(result);
        
        if (result.hasWarnings) {
            await this.handleBatchWarnings(result.warnings);
        }

        this.notifyBatchComplete(result);
    }

    private async handleBatchError(error: BatchError): Promise<void> {
        this.logger.error('Batch processing failed', {
            batchId: error.batchId,
            error: error.message,
            attempts: error.attempts,
            items: error.failedItems
        });

        if (error.attempts < this.config.maxRetries) {
            await this.scheduleBatchRetry(error);
        } else {
            await this.handleBatchFailure(error);
        }
    }

    private async scheduleBatchRetry(error: BatchError): Promise<void> {
        const delay = this.calculateRetryDelay(error.attempts);
        await this.batchManager.scheduleRetry(error.batchId, delay);
    }

    private calculateRetryDelay(attempt: number): number {
        switch (this.config.retryStrategy) {
            case 'linear':
                return attempt * 1000;
            case 'exponential':
                return Math.pow(2, attempt) * 1000;
            case 'fibonacci':
                return this.fibonacci(attempt) * 1000;
            default:
                return 1000;
        }
    }

    private async handleBatchFailure(error: BatchError): Promise<void> {
        await this.notifyFailure(error);
        await this.storeFailedBatch(error);
        await this.triggerFailureRecovery(error);
    }

    private async triggerFailureRecovery(error: BatchError): Promise<void> {
        const recoveryPlan = await this.createRecoveryPlan(error);
        await this.executeRecoveryPlan(recoveryPlan);
    }

    private async createRecoveryPlan(error: BatchError): Promise<RecoveryPlan> {
        return {
            batchId: error.batchId,
            strategy: this.determineRecoveryStrategy(error),
            steps: this.defineRecoverySteps(error),
            validation: this.createRecoveryValidation(error)
        };
    }

    private determineRecoveryStrategy(error: BatchError): RecoveryStrategy {
        if (error.isTransient) {
            return 'retry';
        } else if (error.isDataError) {
            return 'validate';
        } else {
            return 'manual';
        }
    }

    private defineRecoverySteps(error: BatchError): RecoveryStep[] {
        return [
            {
                type: 'validation',
                action: async () => this.validateFailedItems(error.failedItems)
            },
            {
                type: 'correction',
                action: async () => this.correctFailedItems(error.failedItems)
            },
            {
                type: 'reprocess',
                action: async () => this.reprocessItems(error.failedItems)
            }
        ];
    }

    private async executeRecoveryPlan(plan: RecoveryPlan): Promise<void> {
        this.logger.info('Executing recovery plan', { plan });

        for (const step of plan.steps) {
            try {
                await step.action();
            } catch (stepError) {
                this.logger.error('Recovery step failed', {
                    step: step.type,
                    error: stepError
                });
                throw stepError;
            }
        }

        await this.validateRecovery(plan);
    }

    private data: DataPoint[];
    private processingQueue: DataPoint[];
    private readonly batchSize: number;
    private readonly categories: Set<string>;
    private processingErrors: ProcessingError[];
    private readonly validationRules: ValidationRule[];
    private readonly retryAttempts: number;
    private readonly parallelProcessing: boolean;

    constructor(options: ProcessingOptions = {}) {
        this.data = [];
        this.processingQueue = [];
        this.batchSize = options.batchSize || 100;
        this.categories = new Set<string>();
        this.processingErrors = [];
        this.validationRules = options.validationRules || [];
        this.retryAttempts = options.retryAttempts || 3;
        this.parallelProcessing = options.parallelProcessing || false;
    }

    public async addDataPoint(dataPoint: DataPoint): Promise<boolean> {
        try {
            if (this.validateDataPoint(dataPoint)) {
                this.processingQueue.push(dataPoint);
                this.categories.add(dataPoint.category);
                
                if (this.processingQueue.length >= this.batchSize) {
                    await this.processBatch();
                }
                return true;
            }
            return false;
        } catch (error) {
            this.handleError(error as Error, dataPoint);
            return false;
        }
    }

    public async addMultipleDataPoints(dataPoints: DataPoint[]): Promise<ProcessingResult> {
        const startTime = Date.now();
        let processedCount = 0;
        
        try {
            if (this.parallelProcessing) {
                await Promise.all(dataPoints.map(dp => this.addDataPoint(dp)));
            } else {
                for (const dp of dataPoints) {
                    await this.addDataPoint(dp);
                }
            }
            processedCount = dataPoints.length;
        } catch (error) {
            this.handleError(error as Error);
        }

        return {
            success: this.processingErrors.length === 0,
            processedCount,
            errors: this.processingErrors,
            duration: Date.now() - startTime
        };
    }

    private validateDataPoint(dataPoint: DataPoint): boolean {
        for (const rule of this.validationRules) {
            const value = dataPoint[rule.field];
            if (!rule.validator(value)) {
                this.processingErrors.push({
                    dataPoint,
                    message: rule.errorMessage,
                    timestamp: new Date()
                });
                return false;
            }
        }
        return true;
    }

    private async processBatch(): Promise<void> {
        const batch = this.processingQueue.splice(0, this.batchSize);
        let attempt = 0;

        while (attempt < this.retryAttempts) {
            try {
                await this.processDataPoints(batch);
                break;
            } catch (error) {
                attempt++;
                if (attempt === this.retryAttempts) {
                    this.handleError(error as Error);
                }
                await this.delay(1000 * attempt); // Exponential backoff
            }
        }
    }

    private async processDataPoints(dataPoints: DataPoint[]): Promise<void> {
        // Simulate processing time
        await this.delay(100);
        this.data.push(...dataPoints);
    }

    public getAnalyticsByCategory(category: string): DataAnalysis | null {
        const categoryData = this.data.filter(dp => dp.category === category);
        
        if (categoryData.length === 0) {
            return null;
        }

        const values = categoryData.map(dp => dp.value);
        const sortedValues = [...values].sort((a, b) => a - b);

        return {
            category,
            count: values.length,
            average: this.calculateAverage(values),
            median: this.calculateMedian(sortedValues),
            min: Math.min(...values),
            max: Math.max(...values),
            standardDeviation: this.calculateStandardDeviation(values)
        };
    }

    public getAllCategories(): string[] {
        return Array.from(this.categories);
    }

    public getDataPoints(filter?: Partial<DataPoint>): DataPoint[] {
        if (!filter) {
            return [...this.data];
        }

        return this.data.filter(dp => {
            return Object.entries(filter).every(([key, value]) => 
                dp[key as keyof DataPoint] === value
            );
        });
    }

    public clearData(): void {
        this.data = [];
        this.processingQueue = [];
        this.processingErrors = [];
        this.categories.clear();
    }

    public getProcessingErrors(): ProcessingError[] {
        return [...this.processingErrors];
    }

    private calculateAverage(values: number[]): number {
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    private calculateMedian(sortedValues: number[]): number {
        const mid = Math.floor(sortedValues.length / 2);
        return sortedValues.length % 2 === 0
            ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
            : sortedValues[mid];
    }

    private calculateStandardDeviation(values: number[]): number {
        const avg = this.calculateAverage(values);
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const variance = this.calculateAverage(squareDiffs);
        return Math.sqrt(variance);
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private handleError(error: Error, dataPoint?: DataPoint): void {
        if (dataPoint) {
            this.processingErrors.push({
                dataPoint,
                message: error.message,
                timestamp: new Date()
            });
        }
        console.error(`Processing error: ${error.message}`);
    }

    public async exportData(format: 'json' | 'csv'): Promise<string> {
        if (format === 'json') {
            return JSON.stringify(this.data, null, 2);
        }

        // CSV export
        const headers = ['timestamp', 'value', 'category'];
        const rows = this.data.map(dp => 
            `${dp.timestamp.toISOString()},${dp.value},${dp.category}`
        );
        return [headers.join(','), ...rows].join('\n');
    }

    public getStatistics(): Record<string, DataAnalysis> {
        const stats: Record<string, DataAnalysis> = {};
        for (const category of this.categories) {
            const analysis = this.getAnalyticsByCategory(category);
            if (analysis) {
                stats[category] = analysis;
            }
        }
        return stats;
    }

    // Enhanced data processing with validation and error handling
    private async validateAndEnrichDataPoints(dataPoints: DataPoint[]): Promise<DataPoint[]> {
        const validationPromises = dataPoints.map(async dp => {
            try {
                if (this.validateDataPoint(dp)) {
                    const enrichedData = await this.enrichDataPoint(dp);
                    return {
                        isValid: true,
                        data: enrichedData
                    };
                }
                return { isValid: false, data: dp };
            } catch (error) {
                this.handleError(error as Error, dp);
                return { isValid: false, data: dp };
            }
        });

        const results = await Promise.all(validationPromises);
        return results
            .filter(r => r.isValid)
            .map(r => r.data);
    }

    private async enrichDataPoint(dp: DataPoint): Promise<DataPoint> {
        const enriched = { ...dp };
        enriched.metadata = {
            ...enriched.metadata,
            processedAt: new Date(),
            validationLevel: 'enhanced',
            processingVersion: '2.0'
        };

        // Add statistical analysis
        if (this.hasHistoricalData(dp.category)) {
            const stats = await this.calculateCategoryStatistics(dp.category);
            enriched.metadata.categoryStats = stats;
        }

        return enriched;
    }

    // Additional implementation...
}
// Define an interface for a basic item
interface Item {
    id: number;
    name: string;
    description?: string; // Optional description
  }
  
  // Define a class that implements the Item interface
  class BasicItem implements Item {
    id: number;
    name: string;
    description: string;
  
    constructor(id: number, name: string, description: string = "No description provided") {
      this.id = id;
      this.name = name;
      this.description = description;
    }
  
    displayDetails(): void {
      console.log(`ID: ${this.id}, Name: ${this.name}, Description: ${this.description}`);
    }
  }
  
  // Create some instances of BasicItem
  const item1 = new BasicItem(1, "Apple", "A red fruit");
  const item2 = new BasicItem(2, "Banana");
  const item3 = new BasicItem(3, "Orange", "A citrus fruit");
  
  item1.displayDetails();
  item2.displayDetails();
  item3.displayDetails();
  
  // Generic function to reverse an array
  function reverseArray<T>(items: T[]): T[] {
    return items.slice().reverse();
  }
  
  const numberArray = [1, 2, 3, 4, 5];
  const reversedNumbers = reverseArray(numberArray);
  console.log("Reversed Numbers:", reversedNumbers);
  
  const stringArray = ["a", "b", "c", "d"];
  const reversedStrings = reverseArray(stringArray);
  console.log("Reversed Strings:", reversedStrings);
  
  // Enum for possible statuses
  enum Status {
    Open,
    InProgress,
    Resolved,
    Closed
  }
  
  // Function to update the status of an item
  function updateStatus(itemId: number, newStatus: Status): void {
    console.log(`Item ${itemId} status updated to ${Status[newStatus]}`);
  }
  
  updateStatus(1, Status.InProgress);
  updateStatus(2, Status.Resolved);
  
  // Function to calculate the area of a rectangle
  function calculateRectangleArea(width: number, height: number): number {
    return width * height;
  }
  
  console.log("Area of rectangle:", calculateRectangleArea(5, 10));
  
  // Async function to simulate fetching data
  async function fetchData(): Promise<string> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve("Data fetched successfully!");
      }, 2000);
    });
  }
  
  async function processData(): Promise<void> {
    const data = await fetchData();
    console.log(data);
  }
  
  processData();
  
  // Utility function to check if a number is even
  function isEven(num: number): boolean {
    return num % 2 === 0;
  }
  
  console.log("Is 4 even?", isEven(4));
  console.log("Is 7 even?", isEven(7));
  
// task-management-system.ts

// Type definitions
interface Task {
    id: string;
    title: string;
    description: string;
    dueDate: Date;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
  }
  
  interface TaskFilter {
    title?: string;
    completed?: boolean;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    dueBefore?: Date;
    dueAfter?: Date;
  }
  
  interface TaskStatistics {
    total: number;
    completed: number;
    overdue: number;
    priorityDistribution: {
      low: number;
      medium: number;
      high: number;
    };
    tagDistribution: Map<string, number>;
  }
  
  // Utility functions
  function generateId(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
  
  function formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  
  function isTaskOverdue(task: Task): boolean {
    if (task.completed) return false;
    return task.dueDate < new Date();
  }
  
  class TaskManager {
    private tasks: Map<string, Task> = new Map();
    private eventListeners: Map<string, Function[]> = new Map();
  
    constructor(initialTasks: Task[] = []) {
      initialTasks.forEach(task => this.tasks.set(task.id, task));
      this.setupEventListeners();
    }
  
    private setupEventListeners(): void {
      this.eventListeners.set('taskAdded', []);
      this.eventListeners.set('taskUpdated', []);
      this.eventListeners.set('taskDeleted', []);
      this.eventListeners.set('tasksFiltered', []);
    }
  
    private triggerEvent(eventName: string, data: any): void {
      const listeners = this.eventListeners.get(eventName) || [];
      listeners.forEach(listener => listener(data));
    }
  
    addEventListener(eventName: string, callback: Function): void {
      if (!this.eventListeners.has(eventName)) {
        this.eventListeners.set(eventName, []);
      }
      this.eventListeners.get(eventName)?.push(callback);
    }
  
    removeEventListener(eventName: string, callback: Function): void {
      if (!this.eventListeners.has(eventName)) return;
      
      const listeners = this.eventListeners.get(eventName) || [];
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  
    getAllTasks(): Task[] {
      return Array.from(this.tasks.values());
    }
  
    getTaskById(id: string): Task | undefined {
      return this.tasks.get(id);
    }
  
    addTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
      const now = new Date();
      const task: Task = {
        ...taskData,
        id: generateId(),
        createdAt: now,
        updatedAt: now
      };
      
      this.tasks.set(task.id, task);
      this.triggerEvent('taskAdded', task);
      return task;
    }
  
    updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Task | null {
      const task = this.tasks.get(id);
      if (!task) return null;
  
      const updatedTask: Task = {
        ...task,
        ...updates,
        updatedAt: new Date()
      };
  
      this.tasks.set(id, updatedTask);
      this.triggerEvent('taskUpdated', updatedTask);
      return updatedTask;
    }
  
    deleteTask(id: string): boolean {
      if (!this.tasks.has(id)) return false;
      const task = this.tasks.get(id);
      const deleted = this.tasks.delete(id);
      if (deleted) {
        this.triggerEvent('taskDeleted', task);
      }
      return deleted;
    }
  
    filterTasks(filter: TaskFilter): Task[] {
      let filteredTasks = this.getAllTasks();
  
      if (filter.title) {
        filteredTasks = filteredTasks.filter(task => 
          task.title.toLowerCase().includes(filter.title!.toLowerCase()));
      }
  
      if (filter.completed !== undefined) {
        filteredTasks = filteredTasks.filter(task => task.completed === filter.completed);
      }
  
      if (filter.priority) {
        filteredTasks = filteredTasks.filter(task => task.priority === filter.priority);
      }
  
      if (filter.tags && filter.tags.length > 0) {
        filteredTasks = filteredTasks.filter(task => 
          filter.tags!.some(tag => task.tags.includes(tag)));
      }
  
      if (filter.dueBefore) {
        filteredTasks = filteredTasks.filter(task => task.dueDate <= filter.dueBefore!);
      }
  
      if (filter.dueAfter) {
        filteredTasks = filteredTasks.filter(task => task.dueDate >= filter.dueAfter!);
      }
  
      this.triggerEvent('tasksFiltered', filteredTasks);
      return filteredTasks;
    }
  
    getOverdueTasks(): Task[] {
      const now = new Date();
      return this.getAllTasks().filter(task => !task.completed && task.dueDate < now);
    }
  
    getTasksDueToday(): Task[] {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
  
      return this.getAllTasks().filter(task => 
        !task.completed && task.dueDate >= today && task.dueDate < tomorrow);
    }
  
    getTaskStatistics(): TaskStatistics {
      const tasks = this.getAllTasks();
      const now = new Date();
  
      const statistics: TaskStatistics = {
        total: tasks.length,
        completed: tasks.filter(task => task.completed).length,
        overdue: tasks.filter(task => !task.completed && task.dueDate < now).length,
        priorityDistribution: {
          low: tasks.filter(task => task.priority === 'low').length,
          medium: tasks.filter(task => task.priority === 'medium').length,
          high: tasks.filter(task => task.priority === 'high').length
        },
        tagDistribution: new Map<string, number>()
      };
  
      // Calculate tag distribution
      tasks.forEach(task => {
        task.tags.forEach(tag => {
          const count = statistics.tagDistribution.get(tag) || 0;
          statistics.tagDistribution.set(tag, count + 1);
        });
      });
  
      return statistics;
    }
  
    markTaskComplete(id: string): Task | null {
      return this.updateTask(id, { completed: true });
    }
  
    markTaskIncomplete(id: string): Task | null {
      return this.updateTask(id, { completed: false });
    }
  
    batchUpdateTasks(taskIds: string[], updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Task[] {
      const updatedTasks: Task[] = [];
      
      taskIds.forEach(id => {
        const updated = this.updateTask(id, updates);
        if (updated) {
          updatedTasks.push(updated);
        }
      });
      
      return updatedTasks;
    }
  
    batchDeleteTasks(taskIds: string[]): number {
      let deletedCount = 0;
      
      taskIds.forEach(id => {
        if (this.deleteTask(id)) {
          deletedCount++;
        }
      });
      
      return deletedCount;
    }
  
    sortTasksBy(field: keyof Task, ascending: boolean = true): Task[] {
      const tasks = this.getAllTasks();
      
      return tasks.sort((a, b) => {
        if (a[field] < b[field]) return ascending ? -1 : 1;
        if (a[field] > b[field]) return ascending ? 1 : -1;
        return 0;
      });
    }
  
    getTasksGroupedByPriority(): Record<string, Task[]> {
      const tasks = this.getAllTasks();
      const grouped: Record<string, Task[]> = {
        'high': [],
        'medium': [],
        'low': []
      };
      
      tasks.forEach(task => {
        grouped[task.priority].push(task);
      });
      
      return grouped;
    }
  
    getTasksGroupedByTags(): Record<string, Task[]> {
      const tasks = this.getAllTasks();
      const grouped: Record<string, Task[]> = {};
      
      tasks.forEach(task => {
        task.tags.forEach(tag => {
          if (!grouped[tag]) {
            grouped[tag] = [];
          }
          grouped[tag].push(task);
        });
      });
      
      return grouped;
    }
  
    exportTasksToJson(): string {
      return JSON.stringify(Array.from(this.tasks.values()), (key, value) => {
        if (key === 'dueDate' || key === 'createdAt' || key === 'updatedAt') {
          return new Date(value).toISOString();
        }
        return value;
      }, 2);
    }
  
    importTasksFromJson(json: string): void {
      try {
        const tasks = JSON.parse(json, (key, value) => {
          if (key === 'dueDate' || key === 'createdAt' || key === 'updatedAt') {
            return new Date(value);
          }
          return value;
        });
        
        if (!Array.isArray(tasks)) {
          throw new Error('Invalid format: expected array of tasks');
        }
        
        // Clear existing tasks
        this.tasks.clear();
        
        // Add imported tasks
        tasks.forEach(task => {
          if (this.validateTask(task)) {
            this.tasks.set(task.id, task);
          } else {
            console.warn(`Skipping invalid task: ${task.id}`);
          }
        });
        
      } catch (error) {
        console.error('Failed to import tasks:', error);
        throw error;
      }
    }
  
    private validateTask(task: any): task is Task {
      return (
        typeof task.id === 'string' &&
        typeof task.title === 'string' &&
        typeof task.description === 'string' &&
        task.dueDate instanceof Date &&
        typeof task.completed === 'boolean' &&
        ['low', 'medium', 'high'].includes(task.priority) &&
        Array.isArray(task.tags) &&
        task.tags.every((tag: any) => typeof tag === 'string') &&
        task.createdAt instanceof Date &&
        task.updatedAt instanceof Date
      );
    }
  }
  

interface BatchProcessingMetrics {
    batchId: string;
    itemCount: number;
    processedCount: number;
    errorCount: number;
    startTime: Date;
    endTime?: Date;
    status: 'processing' | 'completed' | 'failed';
}

class BatchProcessor {
    private activeBatches: Map<string, BatchProcessingMetrics> = new Map();
    private readonly maxConcurrentBatches = 5;
    private batchQueue: Array<{ id: string; data: any[] }> = [];

    public async processBatch(data: any[]): Promise<BatchProcessingMetrics> {
        const batchId = this.generateBatchId();
        
        if (this.activeBatches.size >= this.maxConcurrentBatches) {
            await this.queueBatch(batchId, data);
            return this.getBatchMetrics(batchId);
        }

        return this.startBatchProcessing(batchId, data);
    }

    private async queueBatch(batchId: string, data: any[]): Promise<void> {
        this.batchQueue.push({ id: batchId, data });
        this.activeBatches.set(batchId, {
            batchId,
            itemCount: data.length,
            processedCount: 0,
            errorCount: 0,
            startTime: new Date(),
            status: 'processing'
        });
    }

    private async startBatchProcessing(batchId: string, data: any[]): Promise<BatchProcessingMetrics> {
        const metrics: BatchProcessingMetrics = {
            batchId,
            itemCount: data.length,
            processedCount: 0,
            errorCount: 0,
            startTime: new Date(),
            status: 'processing'
        };
        
        this.activeBatches.set(batchId, metrics);

        try {
            const results = await Promise.allSettled(
                data.map(item => this.processItem(item))
            );

            metrics.processedCount = results.filter(r => r.status === 'fulfilled').length;
            metrics.errorCount = results.filter(r => r.status === 'rejected').length;
            metrics.status = 'completed';
        } catch (error) {
            metrics.status = 'failed';
            console.error(`Batch ${batchId} failed:`, error);
        } finally {
            metrics.endTime = new Date();
            this.activeBatches.set(batchId, metrics);
            this.processNextBatch();
        }

        return metrics;
    }

    private async processNextBatch(): Promise<void> {
        if (this.batchQueue.length === 0) return;
        
        const nextBatch = this.batchQueue.shift();
        if (nextBatch) {
            await this.startBatchProcessing(nextBatch.id, nextBatch.data);
        }
    }

    private async processItem(item: any): Promise<void> {
        // Implementation of item processing
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    private generateBatchId(): string {
        return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    public getBatchMetrics(batchId: string): BatchProcessingMetrics {
        const metrics = this.activeBatches.get(batchId);
        if (!metrics) {
            throw new Error(`No metrics found for batch ${batchId}`);
        }
        return metrics;
    }

    public getActiveBatchesCount(): number {
        return this.activeBatches.size;
    }

    public getQueueLength(): number {
        return this.batchQueue.length;
    }
}

export default DataProcessor;