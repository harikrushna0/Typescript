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
  
export default DataProcessor;