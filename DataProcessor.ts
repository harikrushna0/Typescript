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
}

export default DataProcessor;