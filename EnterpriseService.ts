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
        storage: StorageConfig;
        security: SecurityConfig;
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
        private network: NetworkManager;
        private storage: StorageManager;

        constructor(private config: IServiceConfig) {
            this.services = new Map();
            this.monitor = new ServiceMonitor(config.monitoring);
            this.scheduler = new ServiceScheduler();
            this.recovery = new RecoveryManager(config.recovery);
            this.network = new NetworkManager(config.networking);
            this.storage = new StorageManager(config.storage);
        }

      // TODO Optimization Type Description

interface ComponentFunction {
    new (props: Record<string, unknown>): Component;
    (props: Record<string, unknown>): VirtualElement | string;
  }
  type VirtualElementType = ComponentFunction | string;
  
  interface VirtualElementProps {
    children?: VirtualElement[];
    [propName: string]: unknown;
  }
  interface VirtualElement {
    type: VirtualElementType;
    props: VirtualElementProps;
  }
  
  type FiberNodeDOM = Element | Text | null | undefined;
  interface FiberNode<S = any> extends VirtualElement {
    alternate: FiberNode<S> | null;
    dom?: FiberNodeDOM;
    effectTag?: string;
    child?: FiberNode;
    return?: FiberNode;
    sibling?: FiberNode;
    hooks?: {
      state: S;
      queue: S[];
    }[];
  }
  
  let wipRoot: FiberNode | null = null;
  let nextUnitOfWork: FiberNode | null = null;
  let currentRoot: FiberNode | null = null;
  let deletions: FiberNode[] = [];
  let wipFiber: FiberNode;
  let hookIndex = 0;
  // Support React.Fragment syntax.
  const Fragment = Symbol.for('react.fragment');
  
  // Enhanced requestIdleCallback.
  ((global: Window) => {
    const id = 1;
    const fps = 1e3 / 60;
    let frameDeadline: number;
    let pendingCallback: IdleRequestCallback;
    const channel = new MessageChannel();
    const timeRemaining = () => frameDeadline - window.performance.now();
  
    const deadline = {
      didTimeout: false,
      timeRemaining,
    };
  
    channel.port2.onmessage = () => {
      if (typeof pendingCallback === 'function') {
        pendingCallback(deadline);
      }
    };
  
    global.requestIdleCallback = (callback: IdleRequestCallback) => {
      global.requestAnimationFrame((frameTime) => {
        frameDeadline = frameTime + fps;
        pendingCallback = callback;
        channel.port1.postMessage(null);
      });
      return id;
    };
  })(window);
  
  const isDef = <T>(param: T): param is NonNullable<T> =>
    param !== void 0 && param !== null;
  
  const isPlainObject = (val: unknown): val is Record<string, unknown> =>
    Object.prototype.toString.call(val) === '[object Object]' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(val));
  
  // Simple judgment of virtual elements.
  const isVirtualElement = (e: unknown): e is VirtualElement =>
    typeof e === 'object';
  
  // Text elements require special handling.
  const createTextElement = (text: string): VirtualElement => ({
    type: 'TEXT',
    props: {
      nodeValue: text,
    },
  });
  
  // Create custom JavaScript data structures.
  const createElement = (
    type: VirtualElementType,
    props: Record<string, unknown> = {},
    ...child: (unknown | VirtualElement)[]
  ): VirtualElement => {
    const children = child.map((c) =>
      isVirtualElement(c) ? c : createTextElement(String(c)),
    );
  
    return {
      type,
      props: {
        ...props,
        children,
      },
    };
  };
  
  // Update DOM properties.
  // For simplicity, we remove all the previous properties and add next properties.
  const updateDOM = (
    DOM: NonNullable<FiberNodeDOM>,
    prevProps: VirtualElementProps,
    nextProps: VirtualElementProps,
  ) => {
    const defaultPropKeys = 'children';
  
    for (const [removePropKey, removePropValue] of Object.entries(prevProps)) {
      if (removePropKey.startsWith('on')) {
        DOM.removeEventListener(
          removePropKey.slice(2).toLowerCase(),
          removePropValue as EventListener,
        );
      } else if (removePropKey !== defaultPropKeys) {
        // @ts-expect-error: Unreachable code error
        DOM[removePropKey] = '';
      }
    }
  
    for (const [addPropKey, addPropValue] of Object.entries(nextProps)) {
      if (addPropKey.startsWith('on')) {
        DOM.addEventListener(
          addPropKey.slice(2).toLowerCase(),
          addPropValue as EventListener,
        );
      } else if (addPropKey !== defaultPropKeys) {
        // @ts-expect-error: Unreachable code error
        DOM[addPropKey] = addPropValue;
      }
    }
  };
  
  // Create DOM based on node type.
  const createDOM = (fiberNode: FiberNode): FiberNodeDOM => {
    const { type, props } = fiberNode;
    let DOM: FiberNodeDOM = null;
  
    if (type === 'TEXT') {
      DOM = document.createTextNode('');
    } else if (typeof type === 'string') {
      DOM = document.createElement(type);
    }
  
    // Update properties based on props after creation.
    if (DOM !== null) {
      updateDOM(DOM, {}, props);
    }
  
    return DOM;
  };
  
  // Change the DOM based on fiber node changes.
  // Note that we must complete the comparison of all fiber nodes before commitRoot.
  // The comparison of fiber nodes can be interrupted, but the commitRoot cannot be interrupted.
  const commitRoot = () => {
    const findParentFiber = (fiberNode?: FiberNode) => {
      if (fiberNode) {
        let parentFiber = fiberNode.return;
        while (parentFiber && !parentFiber.dom) {
          parentFiber = parentFiber.return;
        }
        return parentFiber;
      }
  
      return null;
    };
  
    const commitDeletion = (
      parentDOM: FiberNodeDOM,
      DOM: NonNullable<FiberNodeDOM>,
    ) => {
      if (isDef(parentDOM)) {
        parentDOM.removeChild(DOM);
      }
    };
  
    const commitReplacement = (
      parentDOM: FiberNodeDOM,
      DOM: NonNullable<FiberNodeDOM>,
    ) => {
      if (isDef(parentDOM)) {
        parentDOM.appendChild(DOM);
      }
    };
  
    const commitWork = (fiberNode?: FiberNode) => {
      if (fiberNode) {
        if (fiberNode.dom) {
          const parentFiber = findParentFiber(fiberNode);
          const parentDOM = parentFiber?.dom;
  
          switch (fiberNode.effectTag) {
            case 'REPLACEMENT':
              commitReplacement(parentDOM, fiberNode.dom);
              break;
            case 'UPDATE':
              updateDOM(
                fiberNode.dom,
                fiberNode.alternate ? fiberNode.alternate.props : {},
                fiberNode.props,
              );
              break;
            default:
              break;
          }
        }
  
        commitWork(fiberNode.child);
        commitWork(fiberNode.sibling);
      }
    };
  
    for (const deletion of deletions) {
      if (deletion.dom) {
        const parentFiber = findParentFiber(deletion);
        commitDeletion(parentFiber?.dom, deletion.dom);
      }
    }
  
    if (wipRoot !== null) {
      commitWork(wipRoot.child);
      currentRoot = wipRoot;
    }
  
    wipRoot = null;
  };
  
  // Reconcile the fiber nodes before and after, compare and record the differences.
  const reconcileChildren = (
    fiberNode: FiberNode,
    elements: VirtualElement[] = [],
  ) => {
    let index = 0;
    let oldFiberNode: FiberNode | undefined = void 0;
    let prevSibling: FiberNode | undefined = void 0;
    const virtualElements = elements.flat(Infinity);
  
    if (fiberNode.alternate?.child) {
      oldFiberNode = fiberNode.alternate.child;
    }
  
    while (
      index < virtualElements.length ||
      typeof oldFiberNode !== 'undefined'
    ) {
      const virtualElement = virtualElements[index];
      let newFiber: FiberNode | undefined = void 0;
  
      const isSameType = Boolean(
        oldFiberNode &&
          virtualElement &&
          oldFiberNode.type === virtualElement.type,
      );
  
      if (isSameType && oldFiberNode) {
        newFiber = {
          type: oldFiberNode.type,
          dom: oldFiberNode.dom,
          alternate: oldFiberNode,
          props: virtualElement.props,
          return: fiberNode,
          effectTag: 'UPDATE',
        };
      }
      if (!isSameType && Boolean(virtualElement)) {
        newFiber = {
          type: virtualElement.type,
          dom: null,
          alternate: null,
          props: virtualElement.props,
          return: fiberNode,
          effectTag: 'REPLACEMENT',
        };
      }
      if (!isSameType && oldFiberNode) {
        deletions.push(oldFiberNode);
      }
  
      if (oldFiberNode) {
        oldFiberNode = oldFiberNode.sibling;
      }
  
      if (index === 0) {
        fiberNode.child = newFiber;
      } else if (typeof prevSibling !== 'undefined') {
        prevSibling.sibling = newFiber;
      }
  
      prevSibling = newFiber;
      index += 1;
    }
  };
  
  // Execute each unit task and return to the next unit task.
  // Different processing according to the type of fiber node.
  const performUnitOfWork = (fiberNode: FiberNode): FiberNode | null => {
    const { type } = fiberNode;
    switch (typeof type) {
      case 'function': {
        wipFiber = fiberNode;
        wipFiber.hooks = [];
        hookIndex = 0;
        let children: ReturnType<ComponentFunction>;
  
        if (Object.getPrototypeOf(type).REACT_COMPONENT) {
          const C = type;
          const component = new C(fiberNode.props);
          const [state, setState] = useState(component.state);
          component.props = fiberNode.props;
          component.state = state;
          component.setState = setState;
          children = component.render.bind(component)();
        } else {
          children = type(fiberNode.props);
        }
        reconcileChildren(fiberNode, [
          isVirtualElement(children)
            ? children
            : createTextElement(String(children)),
        ]);
        break;
      }
  
      case 'number':
      case 'string':
        if (!fiberNode.dom) {
          fiberNode.dom = createDOM(fiberNode);
        }
        reconcileChildren(fiberNode, fiberNode.props.children);
        break;
      case 'symbol':
        if (type === Fragment) {
          reconcileChildren(fiberNode, fiberNode.props.children);
        }
        break;
      default:
        if (typeof fiberNode.props !== 'undefined') {
          reconcileChildren(fiberNode, fiberNode.props.children);
        }
        break;
    }
  
    if (fiberNode.child) {
      return fiberNode.child;
    }
  
    let nextFiberNode: FiberNode | undefined = fiberNode;
  
    while (typeof nextFiberNode !== 'undefined') {
      if (nextFiberNode.sibling) {
        return nextFiberNode.sibling;
      }
  
      nextFiberNode = nextFiberNode.return;
    }
  
    return null;
  };
  
  // Use requestIdleCallback to query whether there is currently a unit task
  // and determine whether the DOM needs to be updated.
  const workLoop: IdleRequestCallback = (deadline) => {
    while (nextUnitOfWork && deadline.timeRemaining() > 1) {
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    }
  
    if (!nextUnitOfWork && wipRoot) {
      commitRoot();
    }
  
    window.requestIdleCallback(workLoop);
  };
  
  // Initial or reset.
  const render = (element: VirtualElement, container: Element) => {
    currentRoot = null;
    wipRoot = {
      type: 'div',
      dom: container,
      props: {
        children: [{ ...element }],
      },
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };
  
  abstract class Component {
    props: Record<string, unknown>;
    abstract state: unknown;
    abstract setState: (value: unknown) => void;
    abstract render: () => VirtualElement;
  
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
  
    // Identify Component.
    static REACT_COMPONENT = true;
  }
  
  // Associate the hook with the fiber node.
  function useState<S>(initState: S): [S, (value: S) => void] {
    const fiberNode: FiberNode<S> = wipFiber;
    const hook: {
      state: S;
      queue: S[];
    } = fiberNode?.alternate?.hooks
      ? fiberNode.alternate.hooks[hookIndex]
      : {
          state: initState,
          queue: [],
        };
  
    while (hook.queue.length) {
      let newState = hook.queue.shift();
      if (isPlainObject(hook.state) && isPlainObject(newState)) {
        newState = { ...hook.state, ...newState };
      }
      if (isDef(newState)) {
        hook.state = newState;
      }
    }
  
    if (typeof fiberNode.hooks === 'undefined') {
      fiberNode.hooks = [];
    }
  
    fiberNode.hooks.push(hook);
    hookIndex += 1;
  
    const setState = (value: S) => {
      hook.queue.push(value);
      if (currentRoot) {
        wipRoot = {
          type: currentRoot.type,
          dom: currentRoot.dom,
          props: currentRoot.props,
          alternate: currentRoot,
        };
        nextUnitOfWork = wipRoot;
        deletions = [];
        currentRoot = null;
      }
    };
  
    return [hook.state, setState];
  }
  
  // Start the engine!
  void (function main() {
    window.requestIdleCallback(workLoop);
  })();
  
  export default {
    createElement,
    render,
    useState,
    Component,
    Fragment,
  };
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