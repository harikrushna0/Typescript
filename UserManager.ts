interface User {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'user' | 'guest';
    createdAt: Date;
}

class UserManager {
    private users: Map<number, User>;

    // Enhanced user management with validation and security
    private userValidation: Map<string, ValidationRule[]> = new Map();
    private activeUserSessions: Map<number, UserSession[]> = new Map();
    private readonly maxSessionsPerUser = 5;

    constructor() {
        this.users = new Map<number, User>();
    }

    public addUser(user: User): boolean {
        if (this.users.has(user.id)) {
            return false;
        }
        this.users.set(user.id, user);
        return true;
    }

    public getUser(id: number): User | undefined {
        return this.users.get(id);
    }

    public updateUser(id: number, updateData: Partial<User>): boolean {
        const user = this.users.get(id);
        if (!user) {
            return false;
        }

        this.users.set(id, { ...user, ...updateData });
        return true;
    }

    public deleteUser(id: number): boolean {
        return this.users.delete(id);
    }

    public listUsers(): User[] {
        return Array.from(this.users.values());
    }

    public filterUsersByRole(role: User['role']): User[] {
        return this.listUsers().filter(user => user.role === role);
    }

    public getUserCount(): number {
        return this.users.size;
    }

    public async createUserWithValidation(user: User): Promise<Result<User, string>> {
        try {
            const validationResult = await this.validateUserData(user);
            if (!validationResult.success) {
                return { success: false, error: validationResult.error };
            }

            const existingUser = await this.findUserByEmail(user.email);
            if (existingUser) {
                return { success: false, error: 'Email already exists' };
            }

            const sanitizedUser = this.sanitizeUserData(user);
            const createdUser = await this.createUserInDatabase(sanitizedUser);
            
            await this.initializeUserPermissions(createdUser);
            this.notifyUserCreation(createdUser);
            
            return { success: true, data: createdUser };
        } catch (error) {
            return { 
                success: false, 
                error: `Failed to create user: ${error.message}` 
            };
        }
    }

    // Additional implementation...
}

interface Result<T, E> {
    success: boolean;
    data?: T;
    error?: E;
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

interface UserActivity {
    userId: string;
    action: string;
    timestamp: Date;
    metadata: Record<string, any>;
    sessionId: string;
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
  

class UserActivityTracker {
    private activities: UserActivity[] = [];
    private readonly maxActivityHistory = 1000;
    private analytics: AnalyticsEngine;

    constructor(analytics: AnalyticsEngine) {
        this.analytics = analytics;
        this.startCleanupTask();
    }

    public trackActivity(activity: UserActivity): void {
        this.activities.push(activity);
        this.analytics.trackEvent({
            type: 'user_activity',
            data: activity
        });

        if (this.activities.length > this.maxActivityHistory) {
            this.activities.shift();
        }

        this.analyzeUserBehavior(activity);
    }

    private analyzeUserBehavior(activity: UserActivity): void {
        const userActivities = this.activities.filter(a => a.userId === activity.userId);
        const sessionActivities = userActivities.filter(a => a.sessionId === activity.sessionId);

        // Analyze session length
        if (sessionActivities.length > 1) {
            const sessionLength = activity.timestamp.getTime() -
        }
    }
}

export default UserManager;