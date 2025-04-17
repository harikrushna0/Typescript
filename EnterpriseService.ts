namespace EnterpriseService {
    // Service Interfaces
    export interface IServiceConfig {
        name: string;
        version: string;
        type: ServiceType;
        dependencies: ServiceDependency[];
        scaling: ScalingConfig;
        monitoring: MonitoringConfig;
        recovery: RecoveryConfig;
        networking: NetworkConfig;
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
  
  
    type ServiceType = 'web' | 'worker' | 'api' | 'scheduled';

    interface ServiceDependency {
        name: string;
        version: string;
        type: 'required' | 'optional';
        timeout: number;
    }

    interface ScalingConfig {
        min: number;
        max: number;
        targetCpu: number;
        targetMemory: number;
        cooldown: number;
    }

    interface MonitoringConfig {
        metrics: MetricConfig[];
        alerts: AlertConfig[];
        logging: LogConfig;
        tracing: TraceConfig;
    }

    interface RecoveryConfig {
        maxRetries: number;
        backoffStrategy: 'linear' | 'exponential';
        timeout: number;
        circuit: CircuitBreakerConfig;
    }

    interface NetworkConfig {
        port: number;
        protocol: 'http' | 'https' | 'tcp' | 'udp';
        timeout: number;
        retries: number;
    }

    interface StorageConfig {
        type: 'local' | 'distributed';
        path: string;
        replication: number;
        backup: BackupConfig;
    }

    // Core Service Management
    class ServiceManager {
        private services: Map<string, Service>;
        private monitor: ServiceMonitor;
        private scheduler: ServiceScheduler;
        private recovery: RecoveryManager;

        constructor(private config: IServiceConfig) {
            this.services = new Map();
            this.monitor = new ServiceMonitor(config.monitoring);
            this.scheduler = new ServiceScheduler();
            this.recovery = new RecoveryManager(config.recovery);
            this.initializeServices();
        }

        private async initializeServices(): Promise<void> {
            try {
                await this.startCoreServices();
                await this.startDependentServices();
                await this.startOptionalServices();
            } catch (error) {
                await this.handleInitializationError(error);
                throw error;
            }
        }

        private async startCoreServices(): Promise<void> {
            const coreServices = Array.from(this.services.values())
                .filter(service => service.type === 'core');

            for (const service of coreServices) {
                await this.startServiceWithRetry(service);
            }
        }

        private async startServiceWithRetry(service: Service): Promise<void> {
            const maxRetries = this.config.recovery.maxRetries;
            let attempt = 0;

            while (attempt < maxRetries) {
                try {
                    await this.startService(service);
                    return;
                } catch (error) {
                    attempt++;
                    if (attempt === maxRetries) {
                        throw new Error(`Failed to start service ${service.name} after ${maxRetries} attempts`);
                    }
                    await this.delay(this.calculateBackoff(attempt));
                }
            }
        }

        private calculateBackoff(attempt: number): number {
            switch (this.config.recovery.backoffStrategy) {
                case 'linear':
                    return attempt * 1000;
                case 'exponential':
                    return Math.pow(2, attempt) * 1000;
                default:
                    return 1000;
            }
        }

        private async startService(service: Service): Promise<void> {
            const startTime = Date.now();

            try {
                await this.validateDependencies(service);
                await this.allocateResources(service);
                await this.initializeService(service);
                await this.startServiceInstance(service);
                
                const duration = Date.now() - startTime;
                await this.monitor.recordServiceStart(service.name, {
                    duration,
                    success: true
                });
            } catch (error) {
                const duration = Date.now() - startTime;
                await this.monitor.recordServiceStart(service.name, {
                    duration,
                    success: false,
                    error: error.message
                });
                throw error;
            }
        }

        private async validateDependencies(service: Service): Promise<void> {
            for (const dep of service.dependencies) {
                const dependentService = this.services.get(dep.name);
                if (!dependentService) {
                    throw new Error(`Missing dependency: ${dep.name}`);
                }

                if (!this.isServiceHealthy(dependentService)) {
                    throw new Error(`Dependency ${dep.name} is unhealthy`);
                }
            }
        }

        private isServiceHealthy(service: Service): boolean {
            return service.status === 'running' && 
                   service.health.status === 'healthy';
        }

        private async allocateResources(service: Service): Promise<void> {
            const resources = await this.resourceManager.allocate({
                cpu: service.config.scaling.targetCpu,
                memory: service.config.scaling.targetMemory,
                network: service.config.networking.bandwidth
            });

            if (!resources.success) {
                throw new Error(`Resource allocation failed: ${resources.error}`);
            }

            service.resources = resources.allocated;
            await this.monitor.trackResources(service.name, resources.allocated);
        }

        private async initializeService(service: Service): Promise<void> {
            await service.initialize();
            await this.setupServiceMonitoring(service);
            await this.setupErrorHandling(service);
            await this.setupMetrics(service);
        }

        private async setupServiceMonitoring(service: Service): Promise<void> {
            const healthCheck = async () => {
                try {
                    const health = await service.checkHealth();
                    await this.monitor.recordHealth(service.name, health);

                    if (!health.healthy) {
                        await this.handleUnhealthyService(service, health);
                    }
                } catch (error) {
                    await this.handleHealthCheckError(service, error);
                }
            };

            setInterval(healthCheck, this.config.monitoring.healthCheckInterval);
        }

        private async handleUnhealthyService(
            service: Service, 
            health: HealthStatus
        ): Promise<void> {
            this.logger.warn(`Service ${service.name} is unhealthy`, {
                metrics: health.metrics,
                timestamp: new Date()
            });

            if (health.metrics.errorRate > this.config.monitoring.errorThreshold) {
                await this.recovery.initiateErrorRecovery(service);
            }

            if (health.metrics.memory > this.config.monitoring.memoryThreshold) {
                await this.recovery.initiateMemoryRecovery(service);
            }
        }
    }

    export class ServiceOrchestrator {
        private readonly services: Map<string, ServiceInstance>;
        private readonly monitor: ServiceMonitor;
        private readonly healthCheck: HealthCheckService;
        private readonly metrics: MetricsCollector;

        constructor(private config: ServiceConfig) {
            this.services = new Map();
            this.monitor = new ServiceMonitor(config.monitoring);
            this.healthCheck = new HealthCheckService(config.health);
            this.metrics = new MetricsCollector(config.metrics);
            this.initializeOrchestrator();
        }

        private async initializeOrchestrator(): Promise<void> {
            try {
                await this.validateConfiguration();
                await this.setupMetricsCollection();
                await this.initializeHealthChecks();
                await this.startCoreServices();
                await this.setupServiceRecovery();
            } catch (error) {
                this.handleInitializationError(error);
                throw new Error(`Orchestrator initialization failed: ${error.message}`);
            }
        }

        private async validateConfiguration(): Promise<void> {
            const requiredFields = ['name', 'version', 'type', 'dependencies'];
            for (const field of requiredFields) {
                if (!this.config[field]) {
                    throw new Error(`Missing required configuration field: ${field}`);
                }
            }

            await this.validateDependencies(this.config.dependencies);
        }

        private async validateDependencies(dependencies: ServiceDependency[]): Promise<void> {
            const validationPromises = dependencies.map(async dep => {
                if (dep.type === 'required') {
                    const service = await this.getServiceInstance(dep.name);
                    if (!service) {
                        throw new Error(`Required dependency not found: ${dep.name}`);
                    }
                    if (!this.isServiceCompatible(service, dep)) {
                        throw new Error(`Incompatible dependency version: ${dep.name}`);
                    }
                }
            });

            await Promise.all(validationPromises);
        }

        private isServiceCompatible(service: ServiceInstance, dependency: ServiceDependency): boolean {
            const serviceVersion = this.parseVersion(service.version);
            const requiredVersion = this.parseVersion(dependency.version);

            return serviceVersion.major === requiredVersion.major &&
                   serviceVersion.minor >= requiredVersion.minor;
        }

        private parseVersion(version: string): { major: number; minor: number; patch: number } {
            const [major, minor, patch] = version.split('.').map(Number);
            return { major, minor, patch };
        }

        public async startService(name: string): Promise<void> {
            const service = this.services.get(name);
            if (!service) {
                throw new Error(`Service not found: ${name}`);
            }

            try {
                await this.preStartValidation(service);
                await this.allocateResources(service);
                await this.initializeService(service);
                await this.startServiceInstance(service);
                await this.postStartValidation(service);

                this.metrics.recordServiceStart({
                    name: service.name,
                    timestamp: new Date(),
                    status: 'success'
                });
            } catch (error) {
                this.handleServiceStartError(service, error);
                throw error;
            }
        }

        private async preStartValidation(service: ServiceInstance): Promise<void> {
            await this.validateDependencies(service.dependencies);
            await this.validateResources(service.requirements);
            await this.validateNetworkAccess(service.networking);
        }

        private async validateResources(requirements: ResourceRequirements): Promise<void> {
            const available = await this.getAvailableResources();
            
            if (requirements.cpu > available.cpu) {
                throw new Error('Insufficient CPU resources');
            }
            if (requirements.memory > available.memory) {
                throw new Error('Insufficient memory resources');
            }
            if (requirements.storage > available.storage) {
                throw new Error('Insufficient storage resources');
            }
        }

        private async validateNetworkAccess(networking: NetworkConfig): Promise<void> {
            const requiredPorts = networking.ports || [];
            for (const port of requiredPorts) {
                const isAvailable = await this.checkPortAvailability(port);
                if (!isAvailable) {
                    throw new Error(`Port ${port} is not available`);
                }
            }
        }

        private async allocateResources(service: ServiceInstance): Promise<void> {
            const resources = await this.resourceManager.allocate({
                cpu: service.requirements.cpu,
                memory: service.requirements.memory,
                storage: service.requirements.storage,
                network: service.networking.bandwidth
            });

            if (!resources.success) {
                throw new Error(`Resource allocation failed: ${resources.error}`);
            }

            service.allocatedResources = resources.allocated;
            await this.metrics.trackResources(service.name, resources.allocated);
        }

        private async initializeService(service: ServiceInstance): Promise<void> {
            await service.initialize();
            await this.setupServiceMonitoring(service);
            await this.setupErrorHandling(service);
            await this.configureLogging(service);
        }

        private async setupServiceMonitoring(service: ServiceInstance): Promise<void> {
            const healthCheck = async () => {
                try {
                    const health = await service.checkHealth();
                    await this.monitor.recordHealth(service.name, health);

                    if (!health.healthy) {
                        await this.handleUnhealthyService(service, health);
                    }
                } catch (error) {
                    await this.handleHealthCheckError(service, error);
                }
            };

            service.healthCheckInterval = setInterval(
                healthCheck,
                this.config.monitoring.healthCheckInterval
            );
        }
    }
}

/**
 * Interface for inquirer prompt answers
 * @version 1.0.0
 * @interface
 * @author Nico W.
 * @since 01.11.2022
 */
export interface IPrompt {
    /**
     * Project Name (used in package.json, as folder path,. in readme)
     * @version 1.0.0
     * @author Nico W.
     * @since 01.11.2022
     */
    'project-name': string;
    /**
     * List of possible pre-select-able templates to create a project with
     * Each option has custom template files for faster startup times for new projects
     * @version 1.0.0
     * @author Nico W.
     * @since 01.11.2022
     */
    'project-type': 'http-api@express-utils' | 'websocket-server' | 'socket-io-server' | 'npm-package' | 'empty-project';
    /**
     * Whether a Dockerfile will be added to the template (only asked if not a npm-package)
     * @version 1.0.0
     * @author Nico W.
     * @since 01.11.2022
     */
    'project-dockerfile-enabled': boolean;
    /**
     * Select a CI/CD Template for the remote Git Repository Type
     * The Pipeline will have auto generated steps created by the user selected questions for minimal manual changes
     * @version 1.0.0
     * @author Nico W.
     * @since 01.11.2022
     */
    'project-cicd-pipeline': 'gitlab' | 'github' | 'none';
    /**
     * Additional Dependencies for the project, select what you want
     * @version 1.0.0
     * @author Nico W.
     * @since 01.11.2022
     */
    'project-additional-dependencies': (
      | 'eslint'
      | 'prettier'
      | 'convict'
      | 'ts-node-dev'
      | 'winston'
      | 'joi'
      | 'mqtt'
      | 'amqp'
    )[];
    /**
     * Select you testing frameworks for writing and executing your tests
     * @version 1.0.0
     * @author Nico W.
     * @since 01.11.2022
     */
    'project-testing-dependencies': ('mocha' | 'chai-http' | 'nyc' | 'cypress' | 'jest' | 'vitest')[];
    /**
     * Select your Database Driver for your project
     * @version 1.0.0
     * @author Nico W.
     * @since 01.11.2022
     */
    'project-database-driver': ('mongoose' | 'typeorm' | 'mysql' | 'mysql2' | 'mongodb' | 'redis')[];
    /**
     * Run ncu for fetching latest package versions from npmjs
     * @version 1.0.0
     * @author Nico W.
     * @since 05.11.2022
     */
    'project-ncu-packages': boolean;
    /**
     * run npm install for installing packages
     * @version 1.0.0
     * @author Nico W.
     * @since 05.11.2022
     */
    'project-npm-install-packages': boolean;
    /**
     * run git init for creating a git repository
     * @version 1.0.0
     * @author Nico W.
     * @since 11.11.2022
     */
    'project-git-init': boolean;
    /**
     * copy IDE settings via .idea/ folder to the project
     * @version 1.0.0
     * @author Nico W.
     * @since 11.11.2022
     */
    'project-idea': ('prettier' | 'eslint')[];
  }

  #!/usr/bin/env node
//imports
import { askQuestions } from './lib/promptArray.js';
import answerHandler from './lib/answerHandler.js';

console.log('\nStarting Scaffolder...\n(Press CTRL+C to cancel anytime...)\n');

//start
askQuestions()
  .then((x) => answerHandler.handler(x))
  .then((x) => console.log(x))
  .catch((error) => {
    console.error('There was an unexpected error:');
    console.error(error);
  });
export default EnterpriseService;


import * as db from "./core";
import * as s from "./schema";

(async () => {

  await (async () => {
    
    // setup (uses shortcut functions)
    const allTables: s.AllTables = ["appleTransactions", "authors", "books", "emailAuthentication", "tags"];
    await db.truncate(db.pool, allTables, "CASCADE");

    await db.insert(db.pool, "authors", [
      {
        id: 1,
        name: "Jane Austen",
        isLiving: false,
      }, {
        id: 123,
        name: "Gabriel Garcia Marquez",
        isLiving: false,
      }, {
        id: 456,
        name: "Douglas Adams",
        isLiving: false,
      }
    ]);
    
    const insertedBooks = await db.insert(db.pool, "books", [
      {
        authorId: 1,
        title: "Pride and Prejudice",
      }, {
        authorId: 123,
        title: "Love in the Time of Cholera"
      }
    ]);

    db.insert(db.pool, "tags", [
      { tag: "Spanish", bookId: insertedBooks[1].id },
      { tag: "1980s", bookId: insertedBooks[1].id },
    ]);

  })();

  await (async () => {
    console.log('\n=== Simple manual SELECT ===\n');

    const
      authorId = 1,
      query = db.sql<s.books.SQL>`
        SELECT * FROM ${"books"} WHERE ${{ authorId }}`,
      existingBooks: s.books.Selectable[] = await query.run(db.pool);
  
    console.log(existingBooks);
  })();

  await (async () => {
    console.log('\n=== SELECT with a SQLFragment in a Whereable ===\n');
    
    const
      authorId = 1,
      days = 7,
      query = db.sql<s.books.SQL>`
        SELECT * FROM ${"books"} 
        WHERE ${{
          authorId,
          createdAt: db.sql<s.books.SQL>`
            ${db.self} > now() - ${db.param(days)} * INTERVAL '1 DAY'`,
        }}`,
      existingBooks: s.books.Selectable[] = await query.run(db.pool);
  
    console.log(existingBooks);
  })();

  await (async () => {
    console.log('\n=== Simple manual INSERT ===\n');

    const
      newBook: s.books.Insertable = {
        authorId: 123,
        title: "One Hundred Years of Solitude",
      },
      query = db.sql<s.books.SQL>`
        INSERT INTO ${"books"} (${db.cols(newBook)})
        VALUES (${db.vals(newBook)})`,
      insertedBooks: s.books.Selectable[] = await query.run(db.pool);
    
    console.log(insertedBooks);
  })();

  await (async () => {
    console.log('\n=== Many-to-one join (each book with its one author) ===\n');

    type bookAuthorSQL = s.books.SQL | s.authors.SQL | "author";
    type bookAuthorSelectable = s.books.Selectable & { author: s.authors.Selectable };

    const
      query = db.sql<bookAuthorSQL>`
        SELECT ${"books"}.*, to_jsonb(${"authors"}.*) as ${"author"}
        FROM ${"books"} JOIN ${"authors"} 
          ON ${"books"}.${"authorId"} = ${"authors"}.${"id"}`,
      bookAuthors: bookAuthorSelectable[] = await query.run(db.pool);
    
    console.log(bookAuthors);
  })();

  await (async () => {
    console.log('\n=== One-to-many join (each author with their many books) ===\n');

    // selecting all fields is, logically enough, permitted when grouping by primary key;
    // see: https://www.postgresql.org/docs/current/sql-select.html#SQL-GROUPBY and
    // https://dba.stackexchange.com/questions/158015/why-can-i-select-all-fields-when-grouping-by-primary-key-but-not-when-grouping-b

    type authorBooksSQL = s.authors.SQL | s.books.SQL;
    type authorBooksSelectable = s.authors.Selectable & { books: s.books.Selectable[] };

    const
      query = db.sql<authorBooksSQL>`
        SELECT ${"authors"}.*, coalesce(json_agg(${"books"}.*) filter (where ${"books"}.* is not null), '[]') AS ${"books"}
        FROM ${"authors"} LEFT JOIN ${"books"} 
          ON ${"authors"}.${"id"} = ${"books"}.${"authorId"}
        GROUP BY ${"authors"}.${"id"}`,
      authorBooks: authorBooksSelectable[] = await query.run(db.pool);

    console.dir(authorBooks, { depth: null });
  })();

  await (async () => {
    console.log('\n=== Alternative one-to-many join (using LATERAL) ===\n');

    type authorBooksSQL = s.authors.SQL | s.books.SQL;
    type authorBooksSelectable = s.authors.Selectable & { books: s.books.Selectable[] };

    // note: for consistency, and to keep JSON ops in the DB, we could instead write:
    // SELECT coalesce(jsonb_agg(to_jsonb("authors".*) || to_jsonb(bq.*)), '[]') FROM ...
    
    const
      query = db.sql<authorBooksSQL>`
        SELECT ${"authors"}.*, bq.* 
        FROM ${"authors"} CROSS JOIN LATERAL (
          SELECT coalesce(json_agg(${"books"}.*), '[]') AS ${"books"}
          FROM ${"books"}
          WHERE ${"books"}.${"authorId"} = ${"authors"}.${"id"}
        ) bq`,
      authorBooks: authorBooksSelectable[] = await query.run(db.pool);

    console.dir(authorBooks, { depth: null });
  })();

  await (async () => {
    console.log('\n=== Two-level one-to-many join (using LATERAL) ===\n');

    type authorBookTagsSQL = s.authors.SQL | s.books.SQL | s.tags.SQL;
    type authorBookTagsSelectable = s.authors.Selectable & {
      books: (s.books.Selectable & { tags: s.tags.Selectable['tag'] })[]
    };

    const
      query = db.sql<authorBookTagsSQL>`
        SELECT ${"authors"}.*, bq.*
        FROM ${"authors"} CROSS JOIN LATERAL (
          SELECT coalesce(jsonb_agg(to_jsonb(${"books"}.*) || to_jsonb(tq.*)), '[]') AS ${"books"}
          FROM ${"books"} CROSS JOIN LATERAL (
            SELECT coalesce(jsonb_agg(${"tags"}.${"tag"}), '[]') AS ${"tags"} 
            FROM ${"tags"}
            WHERE ${"tags"}.${"bookId"} = ${"books"}.${"id"}
          ) tq
          WHERE ${"books"}.${"authorId"} = ${"authors"}.${"id"}
        ) bq`,
      authorBookTags: authorBookTagsSelectable[] = await query.run(db.pool);

    console.dir(authorBookTags, { depth: null });
  })();

  await (async () => {
    console.log('\n=== Querying a subset of fields ===\n');

    const bookCols = <const>['id', 'title'];
    type BookDatum = s.books.OnlyCols<typeof bookCols>;

    const
      query = db.sql<s.books.SQL>`SELECT ${db.cols(bookCols)} FROM ${"books"}`,
      bookData: BookDatum[] = await query.run(db.pool);
    
    console.log(bookData);
  })();
  
  await (async () => {
    console.log('\n=== Shortcut functions ===\n');
    
    const
      authorId = 123,
      existingBooks = await db.select(db.pool, "books", { authorId });
    
    console.log(existingBooks);

    const allBookTitles = await db.select(db.pool, "books", undefined, { columns: ['title'] });
    
    console.log(allBookTitles);

    const lastButOneBook = await db.selectOne(db.pool, "books", { authorId }, {
      order: [{ by: "createdAt", direction: "DESC" }], offset: 1
    });

    console.log(lastButOneBook);

    const savedBooks = await db.insert(db.pool, "books", [{
      authorId: 123,
      title: "One Hundred Years of Solitude",
    }, {
      authorId: 456,
      title: "Cheerio, and Thanks for All the Fish",
    }]);
    
    console.log(savedBooks);

    const
      fishBookId = savedBooks[1].id,
      properTitle = "So Long, and Thanks for All the Fish",

      [updatedBook] = await db.update(db.pool, "books",
        { title: properTitle },
        { id: fishBookId }
      );
    
    console.log(updatedBook);
  })();

  await (async () => {
    console.log('\n=== Shortcut UPDATE with a SQLFragment in an Updatable ===\n');

    const email = "me@privacy.net";

    await db.insert(db.pool, "emailAuthentication", { email });

    await db.update(db.pool, "emailAuthentication", {
      consecutiveFailedLogins: db.sql`${db.self} + 1`,
      lastFailedLogin: db.sql`now()`,
    }, { email });
  })();

  await (async () => {
    console.log('\n=== Shortcut UPSERT ===\n');

    await db.insert(db.pool, "appleTransactions", {
      environment: 'PROD',
      originalTransactionId: '123456',
      accountId: 123,
      latestReceiptData: "5Ia+DmVgPHh8wigA",
    });

    const
      newTransactions: s.appleTransactions.Insertable[] = [{
        environment: 'PROD',
        originalTransactionId: '123456',
        accountId: 123,
        latestReceiptData: "TWFuIGlzIGRpc3Rp",
      }, {
        environment: 'PROD',
        originalTransactionId: '234567',
        accountId: 234,
        latestReceiptData: "bmd1aXNoZWQsIG5v",
      }],
      result = await db.upsert(db.pool, "appleTransactions", newTransactions,
        ["environment", "originalTransactionId"]);

    console.log(result);
  })();
  
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
  

  await (async () => {
    console.log('\n=== Transaction ===\n');
    const
      email = "me@privacy.net",
      result = await db.transaction(db.Isolation.Serializable, async txnClient => {

        const emailAuth = await db.selectOne(txnClient, "emailAuthentication", { email });
        
        // do stuff with email record -- e.g. check a password, handle successful login --
        // but remember everything non-DB-related in this function must be idempotent
        // since it might be called several times if there are serialization failures
        
        return db.update(txnClient, "emailAuthentication", {
          consecutiveFailedLogins: db.sql`${db.self} + 1`,
          lastFailedLogin: db.sql`now()`,
        }, { email });
      });
    
    console.log(result);
  })();
  
  await db.pool.end();
})();