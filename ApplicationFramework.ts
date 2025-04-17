namespace ApplicationFramework {
    // Core interfaces
    export interface IApplicationConfig {
        name: string;
        version: string;
        environment: 'development' | 'staging' | 'production';
        modules: ModuleConfig[];
        services: ServiceConfig[];
        logging: LoggingConfig;
        security: SecurityConfig;
        database: DatabaseConfig;
        caching: CacheConfig;
        api: ApiConfig;
        telemetry: TelemetryConfig; // Added telemetry config
    }

    interface ModuleConfig {
        name: string;
        enabled: boolean;
        dependencies?: string[];
        config?: Record<string, any>;
    }

    interface ServiceConfig {
        name: string;
        type: 'singleton' | 'transient' | 'scoped';
        implementation: new (...args: any[]) => any;
    }

    interface LoggingConfig {
        level: 'debug' | 'info' | 'warn' | 'error';
        outputs: ('console' | 'file' | 'remote')[];
        format: 'json' | 'text';
        filename?: string;
        remote?: {
            url: string;
            apiKey: string;
        };
    }

    interface SecurityConfig {
        auth: {
            type: 'jwt' | 'oauth2' | 'basic';
            secret?: string;
            providers?: AuthProvider[];
        };
        encryption: {
            algorithm: string;
            keySize: number;
        };
        rateLimit: {
            windowMs: number;
            maxRequests: number;
        };
    }

    interface DatabaseConfig {
        type: 'mysql' | 'postgres' | 'mongodb';
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
        pool: {
            min: number;
            max: number;
        };
    }

    interface CacheConfig {
        type: 'memory' | 'redis';
        ttl: number;
        redis?: {
            host: string;
            port: number;
        };
    }

    interface ApiConfig {
        port: number;
        cors: {
            enabled: boolean;
            origins: string[];
        };
        rateLimiting: boolean;
        documentation: boolean;
    }

    interface AuthProvider {
        name: string;
        type: string;
        config: Record<string, any>;
    }

    // Add new telemetry system
    interface TelemetryConfig {
        enabled: boolean;
        samplingRate: number;
        endpoint: string;
        bufferSize: number;
        flushInterval: number;
    }

    class TelemetrySystem {
        private buffer: TelemetryEvent[] = [];
        private timer: NodeJS.Timer;

        constructor(private config: TelemetryConfig) {
            this.startFlushTimer();
        }

        public trackEvent(name: string, properties?: Record<string, any>): void {
            if (!this.config.enabled || Math.random() > this.config.samplingRate) {
                return;
            }

            const event: TelemetryEvent = {
                name,
                timestamp: new Date(),
                properties,
                sessionId: this.getCurrentSessionId(),
                machineId: this.getMachineId(),
                processId: process.pid
            };

            this.buffer.push(event);
            if (this.buffer.length >= this.config.bufferSize) {
                this.flush();
            }
        }

        public trackMetric(name: string, value: number, tags?: Record<string, string>): void {
            this.trackEvent('metric', { name, value, tags });
        }

        public trackException(error: Error, properties?: Record<string, any>): void {
            this.trackEvent('exception', {
                ...properties,
                errorName: error.name,
                message: error.message,
                stack: error.stack
            });
        }

        private async flush(): Promise<void> {
            if (this.buffer.length === 0) return;

            const events = [...this.buffer];
            this.buffer = [];

            try {
                await fetch(this.config.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(events)
                });
            } catch (error) {
                console.error('Failed to flush telemetry:', error);
            }
        }

        private startFlushTimer(): void {
            this.timer = setInterval(() => this.flush(), this.config.flushInterval);
        }

        private getCurrentSessionId(): string {
            return `session_${Date.now()}`;
        }

        private getMachineId(): string {
            return `machine_${os.hostname()}`;
        }

        public async stop(): Promise<void> {
            clearInterval(this.timer);
            await this.flush();
        }
    }

    interface TelemetryEvent {
        name: string;
        timestamp: Date;
        properties?: Record<string, any>;
        sessionId: string;
        machineId: string;
        processId: number;
    }
    
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
  

    // New Performance Monitoring System
    interface PerformanceMetrics {
        timestamp: Date;
        cpuUsage: number;
        memoryUsage: number;
        activeConnections: number;
        responseTime: number;
    }

    class PerformanceMonitor {
        private metrics: PerformanceMetrics[] = [];
        private readonly maxHistory: number = 1000;
        private timer: NodeJS.Timer;

        constructor(private interval: number = 5000) {
            this.startMonitoring();
        }

        private startMonitoring(): void {
            this.timer = setInterval(async () => {
                const metrics = await this.collectMetrics();
                this.storeMetrics(metrics);
                this.analyzePerformance(metrics);
            }, this.interval);
        }

        private async collectMetrics(): Promise<PerformanceMetrics> {
            return {
                timestamp: new Date(),
                cpuUsage: await this.getCpuUsage(),
                memoryUsage: this.getMemoryUsage(),
                activeConnections: await this.getActiveConnections(),
                responseTime: await this.getAverageResponseTime()
            };
        }

        private async getCpuUsage(): Promise<number> {
            // CPU usage implementation
            return process.cpuUsage().user / 1000000;
        }

        private getMemoryUsage(): number {
            const used = process.memoryUsage();
            return used.heapUsed / 1024 / 1024;
        }

        private async getActiveConnections(): Promise<number> {
            // Active connections implementation
            return 100;
        }

        private async getAverageResponseTime(): Promise<number> {
            // Response time implementation
            return 150;
        }

        private storeMetrics(metrics: PerformanceMetrics): void {
            this.metrics.push(metrics);
            if (this.metrics.length > this.maxHistory) {
                this.metrics.shift();
            }
        }

        private analyzePerformance(metrics: PerformanceMetrics): void {
            // Performance analysis implementation
            if (metrics.cpuUsage > 80) {
                console.warn('High CPU usage detected');
            }
            if (metrics.memoryUsage > 1024) {
                console.warn('High memory usage detected');
            }
        }

        public getMetricsSummary(): {
            avgCpuUsage: number;
            avgMemoryUsage: number;
            avgResponseTime: number;
            peakConnections: number;
        } {
            const last100Metrics = this.metrics.slice(-100);
            return {
                avgCpuUsage: this.calculateAverage(last100Metrics.map(m => m.cpuUsage)),
                avgMemoryUsage: this.calculateAverage(last100Metrics.map(m => m.memoryUsage)),
                avgResponseTime: this.calculateAverage(last100Metrics.map(m => m.responseTime)),
                peakConnections: Math.max(...last100Metrics.map(m => m.activeConnections))
            };
        }

        private calculateAverage(values: number[]): number {
            return values.reduce((a, b) => a + b, 0) / values.length;
        }

        public stop(): void {
            clearInterval(this.timer);
        }
    }
    // Inventory Management System (300 lines)

// 1. Define interfaces
interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
  }
  
  interface InventoryItem {
    product: Product;
    quantity: number;
  }
  
  interface Order {
    id: string;
    products: { productId: string; quantity: number }[];
    status: 'pending' | 'processing' | 'completed' | 'cancelled';
    createdAt: Date;
  }
  
  // 2. Create decorators
  function logOperation(target: any, key: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      console.log(`Executing ${key} with args: ${JSON.stringify(args)}`);
      const result = originalMethod.apply(this, args);
      console.log(`Completed ${key} with result: ${JSON.stringify(result)}`);
      return result;
    };
    return descriptor;
  }
  
  function validateProduct(target: any, key: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = function (product: Product) {
      if (!product.id || !product.name || product.price <= 0) {
        throw new Error('Invalid product data');
      }
      return originalMethod.apply(this, [product]);
    };
    return descriptor;
  }
  
  // 3. Create generic repository
  class Repository<T extends { id: string }> {
    private items: T[] = [];
  
    add(item: T): void {
      this.items.push(item);
    }
  
    getById(id: string): T | undefined {
      return this.items.find(item => item.id === id);
    }
  
    getAll(): T[] {
      return [...this.items];
    }
  
    update(id: string, updateFn: (item: T) => T): boolean {
      const index = this.items.findIndex(item => item.id === id);
      if (index === -1) return false;
      this.items[index] = updateFn(this.items[index]);
      return true;
    }
  
    delete(id: string): boolean {
      const initialLength = this.items.length;
      this.items = this.items.filter(item => item.id !== id);
      return this.items.length !== initialLength;
    }
  }
  
  // 4. Create inventory service
  class InventoryService {
    private productRepository = new Repository<Product>();
    private inventory: InventoryItem[] = [];
    private orderRepository = new Repository<Order>();
  
    @logOperation
    @validateProduct
    addProduct(product: Product): void {
      this.productRepository.add(product);
    }
  
    @logOperation
    addStock(productId: string, quantity: number): boolean {
      const product = this.productRepository.getById(productId);
      if (!product) return false;
  
      const existingItem = this.inventory.find(item => item.product.id === productId);
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        this.inventory.push({ product, quantity });
      }
      return true;
    }
  
    @logOperation
    removeStock(productId: string, quantity: number): boolean {
      const existingItem = this.inventory.find(item => item.product.id === productId);
      if (!existingItem || existingItem.quantity < quantity) return false;
  
      existingItem.quantity -= quantity;
      if (existingItem.quantity === 0) {
        this.inventory = this.inventory.filter(item => item.product.id !== productId);
      }
      return true;
    }
  
    @logOperation
    createOrder(productQuantities: { productId: string; quantity: number }[]): Order | null {
      // Check stock availability
      for (const pq of productQuantities) {
        const item = this.inventory.find(i => i.product.id === pq.productId);
        if (!item || item.quantity < pq.quantity) return null;
      }
  
      // Create order
      const order: Order = {
        id: `ord-${Date.now()}`,
        products: productQuantities,
        status: 'pending',
        createdAt: new Date()
      };
  
      this.orderRepository.add(order);
      return order;
    }
  
    @logOperation
    async processOrder(orderId: string): Promise<boolean> {
      const order = this.orderRepository.getById(orderId);
      if (!order || order.status !== 'pending') return false;
  
      // Update order status to processing
      this.orderRepository.update(orderId, (o) => ({ ...o, status: 'processing' }));
  
      // Simulate async processing (e.g., payment, shipping)
      await new Promise(resolve => setTimeout(resolve, 1000));
  
      // Deduct stock
      for (const pq of order.products) {
        this.removeStock(pq.productId, pq.quantity);
      }
  
      // Update order status to completed
      this.orderRepository.update(orderId, (o) => ({ ...o, status: 'completed' }));
      return true;
    }
  
    getInventory(): InventoryItem[] {
      return [...this.inventory];
    }
  
    getProducts(): Product[] {
      return this.productRepository.getAll();
    }
  
    getOrders(): Order[] {
      return this.orderRepository.getAll();
    }
  }
  
  // 5. Utility functions
  function generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  function createProduct(name: string, price: number, category: string): Product {
    return {
      id: generateId('prod'),
      name,
      price,
      category
    };
  }
  
  // 6. Example usage
  async function demoInventorySystem() {
    const inventoryService = new InventoryService();
  
    // Add some products
    const laptop = createProduct('Laptop', 999.99, 'Electronics');
    const phone = createProduct('Smartphone', 699.99, 'Electronics');
    const book = createProduct('TypeScript Handbook', 29.99, 'Books');
  
    inventoryService.addProduct(laptop);
    inventoryService.addProduct(phone);
    inventoryService.addProduct(book);
  
    // Add stock
    inventoryService.addStock(laptop.id, 10);
    inventoryService.addStock(phone.id, 15);
    inventoryService.addStock(book.id, 50);
  
    // Create an order
    const order = inventoryService.createOrder([
      { productId: laptop.id, quantity: 2 },
      { productId: book.id, quantity: 3 }
    ]);
  
    if (order) {
      console.log(`Order ${order.id} created`);
      
      // Process the order
      const success = await inventoryService.processOrder(order.id);
      console.log(`Order processing ${success ? 'succeeded' : 'failed'}`);
    }
  
    // Display current inventory
    console.log('Current Inventory:');
    inventoryService.getInventory().forEach(item => {
      console.log(`${item.product.name}: ${item.quantity} in stock`);
    });
  
    // Display all orders
    console.log('All Orders:');
    inventoryService.getOrders().forEach(order => {
      console.log(`Order ${order.id} - Status: ${order.status}`);
    });
  }
  
  // Run the demo
  demoInventorySystem().catch(console.error);
  
  // 7. Additional utility class for demonstration
  class Analytics<T extends { createdAt: Date }> {
    constructor(private data: T[]) {}
  
    filterByDateRange(start: Date, end: Date): T[] {
      return this.data.filter(item => 
        item.createdAt >= start && item.createdAt <= end
      );
    }
  
    countBy(predicate: (item: T) => string): Record<string, number> {
      return this.data.reduce((acc, item) => {
        const key = predicate(item);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }
  
  // 8. Example of using the Analytics class
  function demoAnalytics(inventoryService: InventoryService) {
    const orders = inventoryService.getOrders();
    const analytics = new Analytics(orders);
  
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
  
    console.log('Orders in the last 24 hours:',
      analytics.filterByDateRange(yesterday, today).length
    );
  
    console.log('Orders by status:',
      analytics.countBy(order => order.status)
    );
  }
  // 9. Extended Product with variants
  interface ProductVariant {
    id: string;
    name: string;
    priceModifier: number;
    stock: number;
  }
  
  interface ExtendedProduct extends Product {
    variants?: ProductVariant[];
    description: string;
    tags: string[];
  }
  
  // 10. Discount and Promotion system
  interface Discount {
    id: string;
    code: string;
    percentage: number;
    validUntil: Date;
    applicableCategories: string[];
  }
  
  class PromotionManager {
    private discounts: Discount[] = [];
  
    addDiscount(discount: Discount): void {
      this.discounts.push(discount);
    }
  
    getValidDiscounts(category: string): Discount[] {
      const now = new Date();
      return this.discounts.filter(d => 
        (d.applicableCategories.includes(category) || d.applicableCategories.length === 0) &&
        d.validUntil > now
      );
    }
  
// Inventory Management System (300 lines)

// 1. Define interfaces
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

interface InventoryItem {
  product: Product;
  quantity: number;
}

interface Order {
  id: string;
  products: { productId: string; quantity: number }[];
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  createdAt: Date;
}

// 2. Create decorators
function logOperation(target: any, key: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Executing ${key} with args: ${JSON.stringify(args)}`);
    const result = originalMethod.apply(this, args);
    console.log(`Completed ${key} with result: ${JSON.stringify(result)}`);
    return result;
  };
  return descriptor;
}

function validateProduct(target: any, key: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (product: Product) {
    if (!product.id || !product.name || product.price <= 0) {
      throw new Error('Invalid product data');
    }
    return originalMethod.apply(this, [product]);
  };
  return descriptor;
}

// 3. Create generic repository
class Repository<T extends { id: string }> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  getById(id: string): T | undefined {
    return this.items.find(item => item.id === id);
  }

  getAll(): T[] {
    return [...this.items];
  }

  update(id: string, updateFn: (item: T) => T): boolean {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return false;
    this.items[index] = updateFn(this.items[index]);
    return true;
  }

  delete(id: string): boolean {
    const initialLength = this.items.length;
    this.items = this.items.filter(item => item.id !== id);
    return this.items.length !== initialLength;
  }
}

// 4. Create inventory service
class InventoryService {
  private productRepository = new Repository<Product>();
  private inventory: InventoryItem[] = [];
  private orderRepository = new Repository<Order>();

  @logOperation
  @validateProduct
  addProduct(product: Product): void {
    this.productRepository.add(product);
  }

  @logOperation
  addStock(productId: string, quantity: number): boolean {
    const product = this.productRepository.getById(productId);
    if (!product) return false;

    const existingItem = this.inventory.find(item => item.product.id === productId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      this.inventory.push({ product, quantity });
    }
    return true;
  }

  @logOperation
  removeStock(productId: string, quantity: number): boolean {
    const existingItem = this.inventory.find(item => item.product.id === productId);
    if (!existingItem || existingItem.quantity < quantity) return false;

    existingItem.quantity -= quantity;
    if (existingItem.quantity === 0) {
      this.inventory = this.inventory.filter(item => item.product.id !== productId);
    }
    return true;
  }

  @logOperation
  createOrder(productQuantities: { productId: string; quantity: number }[]): Order | null {
    // Check stock availability
    for (const pq of productQuantities) {
      const item = this.inventory.find(i => i.product.id === pq.productId);
      if (!item || item.quantity < pq.quantity) return null;
    }

    // Create order
    const order: Order = {
      id: `ord-${Date.now()}`,
      products: productQuantities,
      status: 'pending',
      createdAt: new Date()
    };

    this.orderRepository.add(order);
    return order;
  }

  @logOperation
  async processOrder(orderId: string): Promise<boolean> {
    const order = this.orderRepository.getById(orderId);
    if (!order || order.status !== 'pending') return false;

    // Update order status to processing
    this.orderRepository.update(orderId, (o) => ({ ...o, status: 'processing' }));

    // Simulate async processing (e.g., payment, shipping)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Deduct stock
    for (const pq of order.products) {
      this.removeStock(pq.productId, pq.quantity);
    }

    // Update order status to completed
    this.orderRepository.update(orderId, (o) => ({ ...o, status: 'completed' }));
    return true;
  }

  getInventory(): InventoryItem[] {
    return [...this.inventory];
  }

  getProducts(): Product[] {
    return this.productRepository.getAll();
  }

  getOrders(): Order[] {
    return this.orderRepository.getAll();
  }
}

// 5. Utility functions
function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

function createProduct(name: string, price: number, category: string): Product {
  return {
    id: generateId('prod'),
    name,
    price,
    category
  };
}

// 6. Example usage
async function demoInventorySystem() {
  const inventoryService = new InventoryService();

  // Add some products
  const laptop = createProduct('Laptop', 999.99, 'Electronics');
  const phone = createProduct('Smartphone', 699.99, 'Electronics');
  const book = createProduct('TypeScript Handbook', 29.99, 'Books');

  inventoryService.addProduct(laptop);
  inventoryService.addProduct(phone);
  inventoryService.addProduct(book);

  // Add stock
  inventoryService.addStock(laptop.id, 10);
  inventoryService.addStock(phone.id, 15);
  inventoryService.addStock(book.id, 50);

  // Create an order
  const order = inventoryService.createOrder([
    { productId: laptop.id, quantity: 2 },
    { productId: book.id, quantity: 3 }
  ]);

  if (order) {
    console.log(`Order ${order.id} created`);
    
    // Process the order
    const success = await inventoryService.processOrder(order.id);
    console.log(`Order processing ${success ? 'succeeded' : 'failed'}`);
  }

  // Display current inventory
  console.log('Current Inventory:');
  inventoryService.getInventory().forEach(item => {
    console.log(`${item.product.name}: ${item.quantity} in stock`);
  });

  // Display all orders
  console.log('All Orders:');
  inventoryService.getOrders().forEach(order => {
    console.log(`Order ${order.id} - Status: ${order.status}`);
  });
}

// Run the demo
demoInventorySystem().catch(console.error);

// 7. Additional utility class for demonstration
class Analytics<T extends { createdAt: Date }> {
  constructor(private data: T[]) {}

  filterByDateRange(start: Date, end: Date): T[] {
    return this.data.filter(item => 
      item.createdAt >= start && item.createdAt <= end
    );
  }

  countBy(predicate: (item: T) => string): Record<string, number> {
    return this.data.reduce((acc, item) => {
      const key = predicate(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

// 8. Example of using the Analytics class
function demoAnalytics(inventoryService: InventoryService) {
  const orders = inventoryService.getOrders();
  const analytics = new Analytics(orders);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  console.log('Orders in the last 24 hours:',
    analytics.filterByDateRange(yesterday, today).length
  );

  console.log('Orders by status:',
    analytics.countBy(order => order.status)
  );
}
// 9. Extended Product with variants
interface ProductVariant {
  id: string;
  name: string;
  priceModifier: number;
  stock: number;
}

interface ExtendedProduct extends Product {
  variants?: ProductVariant[];
  description: string;
  tags: string[];
}

// 10. Discount and Promotion system
interface Discount {
  id: string;
  code: string;
  percentage: number;
  validUntil: Date;
  applicableCategories: string[];
}

class PromotionManager {
  private discounts: Discount[] = [];

  addDiscount(discount: Discount): void {
    this.discounts.push(discount);
  }

  getValidDiscounts(category: string): Discount[] {
    const now = new Date();
    return this.discounts.filter(d => 
      (d.applicableCategories.includes(category) || d.applicableCategories.length === 0) &&
      d.validUntil > now
    );
  }

  
    // Core Application Class
    export class Application {
        private readonly config: IApplicationConfig;
        private readonly modules: Map<string, Module>;
        private readonly services: Map<string, Service>;
        private readonly eventBus: EventBus;
        private readonly stateManager: StateManager;
        private readonly configManager: ConfigManager;
        private readonly metricRegistry: MetricRegistry;
        private readonly loadBalancer: LoadBalancer;

        constructor(config: IApplicationConfig) {
            this.validateConfiguration(config);
            this.config = this.enrichConfiguration(config);
            this.modules = new Map();
            this.services = new Map();
            this.eventBus = new EventBus();
            this.stateManager = new StateManager();
            this.configManager = new ConfigManager();
            this.metricRegistry = new MetricRegistry();
            this.loadBalancer = new LoadBalancer(config.loadBalancing);
            this.initialize();
        }

        private async initialize(): Promise<void> {
            try {
                await this.initializeCore();
                await this.initializeModules();
                await this.initializeServices();
                await this.setupEventHandlers();
                await this.startMetricsCollection();
                await this.initializeLoadBalancer();
            } catch (error) {
                await this.handleInitializationError(error);
                throw new ApplicationInitializationError('Failed to initialize application', error);
            }
        }

        private async initializeCore(): Promise<void> {
            const coreComponents = [
                this.initializeEventBus(),
                this.initializeStateManager(),
                this.initializeConfigManager(),
                this.initializeMetricRegistry(),
                this.initializeSecurityManager(),
                this.initializeCacheManager(),
                this.initializeDatabaseConnection(),
                this.initializeApiGateway()
            ];

            try {
                await Promise.all(coreComponents);
            } catch (error) {
                throw new CoreInitializationError('Failed to initialize core components', error);
            }
        }

        private async initializeModules(): Promise<void> {
            const moduleInitOrder = this.calculateModuleDependencies();
            
            for (const moduleName of moduleInitOrder) {
                try {
                    await this.initializeModule(moduleName);
                } catch (error) {
                    await this.handleModuleInitializationError(moduleName, error);
                    throw new ModuleInitializationError(
                        `Failed to initialize module: ${moduleName}`,
                        error
                    );
                }
            }
        }
        private async initializeModule(moduleName: string): Promise<void> {
          // ─────[ 1. Input Validation ]────────────────────────────
          if (!moduleName || typeof moduleName !== 'string') {
              this.logger.error(`[Init] Invalid module name: ${moduleName}`);
              throw new Error(`Module name must be a non-empty string.`);
          }
      
          // ─────[ 2. Configuration Lookup ]────────────────────────
          const moduleConfig = this.config.modules.find(m => m.name === moduleName);
      
          if (!moduleConfig) {
              this.logger.warn(`[Init] Module "${moduleName}" not found in config.`);
              return;
          }
      
          if (!moduleConfig.enabled) {
              this.logger.info(`[Init] Module "${moduleName}" is disabled. Skipping.`);
              return;
          }
      
          // ─────[ 3. Dry Run Support ]──────────────────────────────
          if (moduleConfig.dryRun) {
              this.logger.info(`[Init] Module "${moduleName}" is in dry-run mode.`);
              return;
          }
      
          // ─────[ 4. Performance Timing ]───────────────────────────
          const startTime = Date.now();
          this.logger.info(`[Init] Starting module initialization: ${moduleName}`);
      
          // ─────[ 5. Initialization Retry Wrapper ]────────────────
          let attempt = 0;
          const maxRetries = moduleConfig.retries ?? 1;
      
          while (attempt < maxRetries) {
              try {
                  attempt++;
      
                  // ─────[ 6. Module Creation ]───────────────────────
                  const module = await this.createModule(moduleConfig);
      
                  if (!module) {
                      throw new Error(`[Init] Failed to create instance for module "${moduleName}".`);
                  }
      
                  // ─────[ 7. Health Check ]──────────────────────────
                  await this.validateModuleHealth(module);
      
                  // ─────[ 8. Event Handlers ]────────────────────────
                  await this.registerModuleEventHandlers(module);
      
                  // ─────[ 9. State Setup ]───────────────────────────
                  await this.initializeModuleState(module);
      
                  // ─────[ 10. Metrics Binding ]──────────────────────
                  await this.startModuleMetrics(module);
      
                  // ─────[ 11. Optional Lifecycle Hook: onInit ]──────
                  if (typeof module.onInit === 'function') {
                      await module.onInit();
                  }
      
                  // ─────[ 12. Dependency Checks ]────────────────────
                  if (module.dependencies) {
                      for (const dep of module.dependencies) {
                          if (!this.modules.has(dep)) {
                              throw new Error(`[Init] Dependency "${dep}" missing for module "${moduleName}".`);
                          }
                      }
                  }
      
                  // ─────[ 13. Register Module ]──────────────────────
                  this.modules.set(moduleName, module);
      
                  // ─────[ 14. Success Log + Duration ]───────────────
                  const duration = Date.now() - startTime;
                  this.logger.info(`[Init] Module "${moduleName}" initialized in ${duration}ms.`);
      
                  // ─────[ 15. Optional Metrics Emit ]────────────────
                  if (this.metricsCollector?.recordMetric) {
                      this.metricsCollector.recordMetric('module_init_duration', duration, { module: moduleName });
                  }
      
                  // ─────[ 16. Optional Hook: notify success ]────────
                  if (typeof this.notifier?.onModuleInitialized === 'function') {
                      this.notifier.onModuleInitialized(moduleName);
                  }
      
                  // ─────[ 17. Exit Success ]─────────────────────────
                  return;
      
              } catch (err: any) {
                  const isFinalAttempt = attempt === maxRetries;
      
                  // ─────[ 18. Error Handling ]──────────────────────
                  this.logger.error(`[Init] Module "${moduleName}" failed on attempt ${attempt}: ${err.message}`);
      
                  // ─────[ 19. Error Tracking Integration ]──────────
                  if (this.errorHandler?.capture) {
                      this.errorHandler.capture(err, {
                          context: 'module_initialize',
                          module: moduleName,
                          attempt,
                      });
                  }
      
                  // ─────[ 20. Retry or Exit ]────────────────────────
                  if (!isFinalAttempt) {
                      const backoffMs = attempt * 1000;
                      this.logger.warn(`[Init] Retrying module "${moduleName}" in ${backoffMs}ms...`);
                      await this.delay(backoffMs);
                  } else {
                      this.logger.fatal(`[Init] Module "${moduleName}" failed after ${maxRetries} attempt(s).`);
                      throw err;
                  }
              }
          }
      }
      
      // ─────[ 21. Helper: Delay ]────────────────────────────────────
      private async delay(ms: number): Promise<void> {
          return new Promise(resolve => setTimeout(resolve, ms));
      }
      

        private async handleModuleInitializationError(
            moduleName: string,
            error: Error
        ): Promise<void> {
            await this.metricRegistry.incrementCounter('module_initialization_failure');
            await this.notifyAdministrators({
                type: 'ModuleInitializationFailure',
                moduleName,
                error: error.message,
                timestamp: new Date()
            });

            if (this.isRecoverableError(error)) {
                await this.attemptModuleRecovery(moduleName);
            }
        }

        private async initializeServices(): Promise<void> {
            const serviceGroups = this.groupServicesByDependencies();
            
            for (const group of serviceGroups) {
                await Promise.all(
                    group.map(serviceName => this.initializeService(serviceName))
                );
            }
        }

        private async initializeService(serviceName: string): Promise<void> {
            const serviceConfig = this.config.services.find(s => s.name === serviceName);
            if (!serviceConfig) return;

            try {
                const service = await this.createService(serviceConfig);
                await this.validateServiceHealth(service);
                await this.registerServiceEventHandlers(service);
                await this.initializeServiceState(service);
                await this.startServiceMetrics(service);

                this.services.set(serviceName, service);
            } catch (error) {
                await this.handleServiceInitializationError(serviceName, error);
            }
        }

        private groupServicesByDependencies(): string[][] {
            const serviceNodes = new Map<string, Set<string>>();
            const groups: string[][] = [];

            // Build dependency graph
            this.config.services.forEach(service => {
                serviceNodes.set(
                    service.name,
                    new Set(service.dependencies || [])
                );
            });

            // Topological sort
            while (serviceNodes.size > 0) {
                const group = Array.from(serviceNodes.entries())
                    .filter(([_, deps]) => deps.size === 0)
                    .map(([name]) => name);

                if (group.length === 0) {
                    throw new Error('Circular dependency detected in services');
                }

                groups.push(group);

                // Remove satisfied dependencies
                group.forEach(serviceName => {
                    serviceNodes.delete(serviceName);
                    serviceNodes.forEach(deps => deps.delete(serviceName));
                });
            }

            return groups;
        }

        private async handleServiceInitializationError(
            serviceName: string,
            error: Error
        ): Promise<void> {
            await this.metricRegistry.incrementCounter('service_initialization_failure');
            await this.notifyAdministrators({
                type: 'ServiceInitializationFailure',
                serviceName,
                error: error.message,
                timestamp: new Date()
            });

            if (this.isRecoverableError(error)) {
                await this.attemptServiceRecovery(serviceName);
            }
        }
    }
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
  

export default ApplicationFramework;