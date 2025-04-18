import { createHmac, randomBytes } from 'crypto';
import { promisify } from 'util';

interface AuthConfig {
    jwtSecret: string;
    tokenExpiry: number;
    maxLoginAttempts: number;
    lockoutDuration: number;
    passwordPolicy: PasswordPolicy;
    mfaEnabled: boolean;
}

interface PasswordPolicy {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    preventReuse: number;
}

interface BiometricAuthConfig {
    enabled: boolean;
    providers: BiometricProvider[];
    requiredFactors: number;
    timeout: number;
}

interface SocialAuthConfig {
    providers: Map<string, OAuthProvider>;
    callbackUrl: string;
    stateTimeout: number;
}

interface AuditLogEntry {
    id: string;
    userId: string;
    action: string;
    timestamp: Date;
    metadata: Record<string, any>;
    ip: string;
    device: DeviceInfo;
}

import { User, AuthResult, TokenValidationResult, Session } from './types';
import { SecurityService } from './SecurityService';
import { UserManager } from './UserManager';
import { Logger } from './utils/Logger';

export class AuthenticationService {
    private readonly security: SecurityService;
    private readonly userManager: UserManager;
    private readonly logger: Logger;
    private readonly maxLoginAttempts = 5;
    private readonly lockoutDuration = 30 * 60 * 1000; // 30 minutes

    constructor() {
        this.security = new SecurityService();
        this.userManager = new UserManager();
        this.logger = new Logger('AuthenticationService');
    }

    public async login(username: string, password: string): Promise<AuthResult> {
        await this.checkLoginAttempts(username);

        try {
            const user = await this.userManager.findByUsername(username);
            if (!user) {
                throw new Error('Invalid credentials');
            }

            const isPasswordValid = await this.security.verifyPassword(
                password,
                user.passwordHash
            );

            if (!isPasswordValid) {
                await this.handleAuthenticationError(username, new Error('Invalid password'));
                throw new Error('Invalid credentials');
            }

            await this.validateMFAToken(user);
            const session = await this.createSession(user);

            await this.userManager.updateLastLogin(user.id);
            await this.security.clearLoginAttempts(username);

            return {
                success: true,
                token: session.token,
                user: this.sanitizeUser(user)
            };
        } catch (error) {
            this.logger.error('Login failed', { username, error: error.message });
            throw error;
        }
    }

    public async validateToken(token: string): Promise<TokenValidationResult> {
        try {
            const decoded = await this.security.verifyToken(token);
            const session = await this.userManager.getSession(decoded.sessionId);

            if (!session || session.isRevoked) {
                throw new Error('Invalid session');
            }

            const user = await this.userManager.findById(decoded.userId);
            return { valid: true, user: this.sanitizeUser(user) };
        } catch (error) {
            this.logger.error('Token validation failed', { error: error.message });
            return { valid: false, error: error.message };
        }
    }

    public async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.userManager.findById(userId);
        
        if (!user) {
            throw new Error('User not found');
        }

        const isValid = await this.security.verifyPassword(
            currentPassword,
            user.passwordHash
        );

        if (!isValid) {
            throw new Error('Invalid current password');
        }

        await this.validatePasswordPolicy(newPassword);
        const hashedPassword = await this.security.hashPassword(newPassword);
        
        await this.userManager.updatePassword(userId, hashedPassword);
        await this.revokeAllSessions(userId);
    }

    private async validatePasswordPolicy(password: string): Promise<void> {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (password.length < minLength) {
            throw new Error('Password must be at least 8 characters long');
        }

        if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
            throw new Error('Password must contain uppercase, lowercase, numbers and special characters');
        }
    }

    private async createSession(user: User): Promise<Session> {
        const token = await this.security.generateToken({
            userId: user.id,
            role: user.role
        });

        const session = {
            id: crypto.randomUUID(),
            userId: user.id,
            token,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            isRevoked: false,
            device: this.getCurrentDevice()
        };

        await this.userManager.saveSession(session);
        return session;
    }

    private getCurrentDevice(): any {
        return {
            type: 'web',
            userAgent: 'browser',
            ip: '127.0.0.1',
            timestamp: new Date()
        };
    }

    private sanitizeUser(user: User): Partial<User> {
        const { passwordHash, ...safeUser } = user;
        return safeUser;
    }
}

import {
    arrayFrom,
    CancellationToken,
    CompilerOptions,
    computeSignatureWithDiagnostics,
    CustomTransformers,
    Debug,
    EmitOnly,
    EmitOutput,
    emptyArray,
    GetCanonicalFileName,
    getDirectoryPath,
    getIsolatedModules,
    getSourceFileOfNode,
    HostForComputeHash,
    isDeclarationFileName,
    isExternalOrCommonJsModule,
    isGlobalScopeAugmentation,
    isJsonSourceFile,
    isModuleWithStringLiteralName,
    isStringLiteral,
    mapDefined,
    mapDefinedIterator,
    ModuleDeclaration,
    ModuleKind,
    OutputFile,
    Path,
    Program,
    ResolutionMode,
    some,
    SourceFile,
    StringLiteralLike,
    Symbol,
    toPath,
    TypeChecker,
} from "./_namespaces/ts.js";

/** @internal */
export function getFileEmitOutput(
    program: Program,
    sourceFile: SourceFile,
    emitOnlyDtsFiles: boolean,
    cancellationToken?: CancellationToken,
    customTransformers?: CustomTransformers,
    forceDtsEmit?: boolean,
): EmitOutput {
    const outputFiles: OutputFile[] = [];
    const { emitSkipped, diagnostics } = program.emit(sourceFile, writeFile, cancellationToken, emitOnlyDtsFiles, customTransformers, forceDtsEmit);
    return { outputFiles, emitSkipped, diagnostics };

    function writeFile(fileName: string, text: string, writeByteOrderMark: boolean) {
        outputFiles.push({ name: fileName, writeByteOrderMark, text });
    }
}
/** @internal */
export enum SignatureInfo {
    ComputedDts,
    StoredSignatureAtEmit,
    UsedVersion,
}
/** @internal */
export interface BuilderState {
    /**
     * Information of the file eg. its version, signature etc
     */
    fileInfos: Map<Path, BuilderState.FileInfo>;
    /**
     * Contains the map of ReferencedSet=Referenced files of the file if module emit is enabled
     * Otherwise undefined
     * Thus non undefined value indicates, module emit
     */
    readonly referencedMap?: BuilderState.ReadonlyManyToManyPathMap | undefined;
    /**
     * true if file version is used as signature
     * This helps in delaying the calculation of the d.ts hash as version for the file till reasonable time
     */
    useFileVersionAsSignature?: boolean;
    /**
     * Map of files that have already called update signature.
     * That means hence forth these files are assumed to have
     * no change in their signature for this version of the program
     */
    hasCalledUpdateShapeSignature?: Set<Path>;
    /**
     * Stores signatures before before the update till affected file is committed
     */
    oldSignatures?: Map<Path, string | false>;
    /**
     * Cache of all files excluding default library file for the current program
     */
    allFilesExcludingDefaultLibraryFile?: readonly SourceFile[];
    /**
     * Cache of all the file names
     */
    allFileNames?: readonly string[];
    /** Information about the signature computation - test only */
    signatureInfo?: Map<Path, SignatureInfo>;
}
/** @internal */
export namespace BuilderState {
    /**
     * Information about the source file: Its version and optional signature from last emit
     */
    export interface FileInfo {
        readonly version: string;
        signature: string | undefined;
        affectsGlobalScope: true | undefined;
        impliedFormat: ResolutionMode;
    }

    export interface ReadonlyManyToManyPathMap {
        getKeys(v: Path): ReadonlySet<Path> | undefined;
        getValues(k: Path): ReadonlySet<Path> | undefined;
        keys(): IterableIterator<Path>;
        size(): number;
    }

    export interface ManyToManyPathMap extends ReadonlyManyToManyPathMap {
        deleteKey(k: Path): boolean;
        set(k: Path, v: ReadonlySet<Path>): void;
    }

    export function createManyToManyPathMap(): ManyToManyPathMap {
        function create(forward: Map<Path, ReadonlySet<Path>>, reverse: Map<Path, Set<Path>>, deleted: Set<Path> | undefined): ManyToManyPathMap {
            const map: ManyToManyPathMap = {
                getKeys: v => reverse.get(v),
                getValues: k => forward.get(k),
                keys: () => forward.keys(),
                size: () => forward.size,

                deleteKey: k => {
                    (deleted ||= new Set<Path>()).add(k);

                    const set = forward.get(k);
                    if (!set) {
                        return false;
                    }

                    set.forEach(v => deleteFromMultimap(reverse, v, k));
                    forward.delete(k);
                    return true;
                },
                set: (k, vSet) => {
                    deleted?.delete(k);

                    const existingVSet = forward.get(k);
                    forward.set(k, vSet);

                    existingVSet?.forEach(v => {
                        if (!vSet.has(v)) {
                            deleteFromMultimap(reverse, v, k);
                        }
                    });

                    vSet.forEach(v => {
                        if (!existingVSet?.has(v)) {
                            addToMultimap(reverse, v, k);
                        }
                    });

                    return map;
                },
            };

            return map;
        }

        return create(new Map<Path, Set<Path>>(), new Map<Path, Set<Path>>(), /*deleted*/ undefined);
    }

    function addToMultimap<K, V>(map: Map<K, Set<V>>, k: K, v: V): void {
        let set = map.get(k);
        if (!set) {
            set = new Set<V>();
            map.set(k, set);
        }
        set.add(v);
    }

    function deleteFromMultimap<K, V>(map: Map<K, Set<V>>, k: K, v: V): boolean {
        const set = map.get(k);

        if (set?.delete(v)) {
            if (!set.size) {
                map.delete(k);
            }
            return true;
        }

        return false;
    }

    function getReferencedFilesFromImportedModuleSymbol(symbol: Symbol): Path[] {
        return mapDefined(symbol.declarations, declaration => getSourceFileOfNode(declaration)?.resolvedPath);
    }

    /**
     * Get the module source file and all augmenting files from the import name node from file
     */
    function getReferencedFilesFromImportLiteral(checker: TypeChecker, importName: StringLiteralLike): Path[] | undefined {
        const symbol = checker.getSymbolAtLocation(importName);
        return symbol && getReferencedFilesFromImportedModuleSymbol(symbol);
    }

    /**
     * Gets the path to reference file from file name, it could be resolvedPath if present otherwise path
     */
    function getReferencedFileFromFileName(program: Program, fileName: string, sourceFileDirectory: Path, getCanonicalFileName: GetCanonicalFileName): Path {
        return toPath(program.getProjectReferenceRedirect(fileName) || fileName, sourceFileDirectory, getCanonicalFileName);
    }

    /**
     * Gets the referenced files for a file from the program with values for the keys as referenced file's path to be true
     */
    function getReferencedFiles(program: Program, sourceFile: SourceFile, getCanonicalFileName: GetCanonicalFileName): Set<Path> | undefined {
        let referencedFiles: Set<Path> | undefined;

        // We need to use a set here since the code can contain the same import twice,
        // but that will only be one dependency.
        // To avoid invernal conversion, the key of the referencedFiles map must be of type Path
        if (sourceFile.imports && sourceFile.imports.length > 0) {
            const checker: TypeChecker = program.getTypeChecker();
            for (const importName of sourceFile.imports) {
                const declarationSourceFilePaths = getReferencedFilesFromImportLiteral(checker, importName);
                declarationSourceFilePaths?.forEach(addReferencedFile);
            }
        }

        const sourceFileDirectory = getDirectoryPath(sourceFile.resolvedPath);
        // Handle triple slash references
        if (sourceFile.referencedFiles && sourceFile.referencedFiles.length > 0) {
            for (const referencedFile of sourceFile.referencedFiles) {
                const referencedPath = getReferencedFileFromFileName(program, referencedFile.fileName, sourceFileDirectory, getCanonicalFileName);
                addReferencedFile(referencedPath);
            }
        }

        // Handle type reference directives
        program.forEachResolvedTypeReferenceDirective(({ resolvedTypeReferenceDirective }) => {
            if (!resolvedTypeReferenceDirective) {
                return;
            }

            const fileName = resolvedTypeReferenceDirective.resolvedFileName!; // TODO: GH#18217
            const typeFilePath = getReferencedFileFromFileName(program, fileName, sourceFileDirectory, getCanonicalFileName);
            addReferencedFile(typeFilePath);
        }, sourceFile);

        // Add module augmentation as references
        if (sourceFile.moduleAugmentations.length) {
            const checker = program.getTypeChecker();
            for (const moduleName of sourceFile.moduleAugmentations) {
                if (!isStringLiteral(moduleName)) continue;
                const symbol = checker.getSymbolAtLocation(moduleName);
                if (!symbol) continue;

                // Add any file other than our own as reference
                addReferenceFromAmbientModule(symbol);
            }
        }

        // From ambient modules
        for (const ambientModule of program.getTypeChecker().getAmbientModules()) {
            if (ambientModule.declarations && ambientModule.declarations.length > 1) {
                addReferenceFromAmbientModule(ambientModule);
            }
        }

        return referencedFiles;

        function addReferenceFromAmbientModule(symbol: Symbol) {
            if (!symbol.declarations) {
                return;
            }
            // Add any file other than our own as reference
            for (const declaration of symbol.declarations) {
                const declarationSourceFile = getSourceFileOfNode(declaration);
                if (
                    declarationSourceFile &&
                    declarationSourceFile !== sourceFile
                ) {
                    addReferencedFile(declarationSourceFile.resolvedPath);
                }
            }
        }

        function addReferencedFile(referencedPath: Path) {
            (referencedFiles || (referencedFiles = new Set())).add(referencedPath);
        }
    }

    /**
     * Returns true if oldState is reusable, that is the emitKind = module/non module has not changed
     */
    export function canReuseOldState(newReferencedMap: ReadonlyManyToManyPathMap | undefined, oldState: BuilderState | undefined): boolean | undefined {
        return oldState && !oldState.referencedMap === !newReferencedMap;
    }

    export function createReferencedMap(options: CompilerOptions): ManyToManyPathMap | undefined {
        return options.module !== ModuleKind.None && !options.outFile ?
            createManyToManyPathMap() :
            undefined;
    }

    /**
     * Creates the state of file references and signature for the new program from oldState if it is safe
     */
    export function create(newProgram: Program, oldState: Readonly<BuilderState> | undefined, disableUseFileVersionAsSignature: boolean): BuilderState {
        const fileInfos = new Map<Path, FileInfo>();
        const options = newProgram.getCompilerOptions();
        const referencedMap = createReferencedMap(options);
        const useOldState = canReuseOldState(referencedMap, oldState);

        // Ensure source files have parent pointers set
        newProgram.getTypeChecker();

        // Create the reference map, and set the file infos
        for (const sourceFile of newProgram.getSourceFiles()) {
            const version = Debug.checkDefined(sourceFile.version, "Program intended to be used with Builder should have source files with versions set");
            const oldUncommittedSignature = useOldState ? oldState!.oldSignatures?.get(sourceFile.resolvedPath) : undefined;
            const signature = oldUncommittedSignature === undefined ?
                useOldState ? oldState!.fileInfos.get(sourceFile.resolvedPath)?.signature : undefined :
                oldUncommittedSignature || undefined;
            if (referencedMap) {
                const newReferences = getReferencedFiles(newProgram, sourceFile, newProgram.getCanonicalFileName);
                if (newReferences) {
                    referencedMap.set(sourceFile.resolvedPath, newReferences);
                }
            }
            fileInfos.set(sourceFile.resolvedPath, {
                version,
                signature,
                // No need to calculate affectsGlobalScope with --out since its not used at all
                affectsGlobalScope: !options.outFile ? isFileAffectingGlobalScope(sourceFile) || undefined : undefined,
                impliedFormat: sourceFile.impliedNodeFormat,
            });
        }

        return {
            fileInfos,
            referencedMap,
            useFileVersionAsSignature: !disableUseFileVersionAsSignature && !useOldState,
        };
    }

    /**
     * Releases needed properties
     */
    export function releaseCache(state: BuilderState): void {
        state.allFilesExcludingDefaultLibraryFile = undefined;
        state.allFileNames = undefined;
    }

    /**
     * Gets the files affected by the path from the program
     */
    export function getFilesAffectedBy(
        state: BuilderState,
        programOfThisState: Program,
        path: Path,
        cancellationToken: CancellationToken | undefined,
        host: HostForComputeHash,
    ): readonly SourceFile[] {
        const result = getFilesAffectedByWithOldState(
            state,
            programOfThisState,
            path,
            cancellationToken,
            host,
        );
        state.oldSignatures?.clear();
        return result;
    }

    export function getFilesAffectedByWithOldState(
        state: BuilderState,
        programOfThisState: Program,
        path: Path,
        cancellationToken: CancellationToken | undefined,
        host: HostForComputeHash,
    ): readonly SourceFile[] {
        const sourceFile = programOfThisState.getSourceFileByPath(path);
        if (!sourceFile) {
            return emptyArray;
        }

        if (!updateShapeSignature(state, programOfThisState, sourceFile, cancellationToken, host)) {
            return [sourceFile];
        }

        return (state.referencedMap ? getFilesAffectedByUpdatedShapeWhenModuleEmit : getFilesAffectedByUpdatedShapeWhenNonModuleEmit)(state, programOfThisState, sourceFile, cancellationToken, host);
    }

    export function updateSignatureOfFile(state: BuilderState, signature: string | undefined, path: Path): void {
        state.fileInfos.get(path)!.signature = signature;
        (state.hasCalledUpdateShapeSignature ||= new Set()).add(path);
    }

    export function computeDtsSignature(
        programOfThisState: Program,
        sourceFile: SourceFile,
        cancellationToken: CancellationToken | undefined,
        host: HostForComputeHash,
        onNewSignature: (signature: string, sourceFiles: readonly SourceFile[]) => void,
    ): void {
        programOfThisState.emit(
            sourceFile,
            (fileName, text, _writeByteOrderMark, _onError, sourceFiles, data) => {
                Debug.assert(isDeclarationFileName(fileName), `File extension for signature expected to be dts: Got:: ${fileName}`);
                onNewSignature(
                    computeSignatureWithDiagnostics(
                        programOfThisState,
                        sourceFile,
                        text,
                        host,
                        data,
                    ),
                    sourceFiles!,
                );
            },
            cancellationToken,
            EmitOnly.BuilderSignature,
            /*customTransformers*/ undefined,
            /*forceDtsEmit*/ true,
        );
    }

    /**
     * Returns if the shape of the signature has changed since last emit
     */
    export function updateShapeSignature(
        state: BuilderState,
        programOfThisState: Program,
        sourceFile: SourceFile,
        cancellationToken: CancellationToken | undefined,
        host: HostForComputeHash,
        useFileVersionAsSignature: boolean | undefined = state.useFileVersionAsSignature,
    ): boolean {
        // If we have cached the result for this file, that means hence forth we should assume file shape is uptodate
        if (state.hasCalledUpdateShapeSignature?.has(sourceFile.resolvedPath)) return false;

        const info = state.fileInfos.get(sourceFile.resolvedPath)!;
        const prevSignature = info.signature;
        let latestSignature: string | undefined;
        if (!sourceFile.isDeclarationFile && !useFileVersionAsSignature) {
            computeDtsSignature(programOfThisState, sourceFile, cancellationToken, host, signature => {
                latestSignature = signature;
                if (host.storeSignatureInfo) (state.signatureInfo ??= new Map()).set(sourceFile.resolvedPath, SignatureInfo.ComputedDts);
            });
        }
        // Default is to use file version as signature
        if (latestSignature === undefined) {
            latestSignature = sourceFile.version;
            if (host.storeSignatureInfo) (state.signatureInfo ??= new Map()).set(sourceFile.resolvedPath, SignatureInfo.UsedVersion);
        }
        (state.oldSignatures ||= new Map()).set(sourceFile.resolvedPath, prevSignature || false);
        (state.hasCalledUpdateShapeSignature ||= new Set()).add(sourceFile.resolvedPath);
        info.signature = latestSignature;
        return latestSignature !== prevSignature;
    }

    /**
     * Get all the dependencies of the sourceFile
     */
    export function getAllDependencies(state: BuilderState, programOfThisState: Program, sourceFile: SourceFile): readonly string[] {
        const compilerOptions = programOfThisState.getCompilerOptions();
        // With --out or --outFile all outputs go into single file, all files depend on each other
        if (compilerOptions.outFile) {
            return getAllFileNames(state, programOfThisState);
        }

        // If this is non module emit, or its a global file, it depends on all the source files
        if (!state.referencedMap || isFileAffectingGlobalScope(sourceFile)) {
            return getAllFileNames(state, programOfThisState);
        }

        // Get the references, traversing deep from the referenceMap
        const seenMap = new Set<Path>();
        const queue = [sourceFile.resolvedPath];
        while (queue.length) {
            const path = queue.pop()!;
            if (!seenMap.has(path)) {
                seenMap.add(path);
                const references = state.referencedMap.getValues(path);
                if (references) {
                    for (const key of references.keys()) {
                        queue.push(key);
                    }
                }
            }
        }

        return arrayFrom(mapDefinedIterator(seenMap.keys(), path => programOfThisState.getSourceFileByPath(path)?.fileName ?? path));
    }

    /**
     * Gets the names of all files from the program
     */
    function getAllFileNames(state: BuilderState, programOfThisState: Program): readonly string[] {
        if (!state.allFileNames) {
            const sourceFiles = programOfThisState.getSourceFiles();
            state.allFileNames = sourceFiles === emptyArray ? emptyArray : sourceFiles.map(file => file.fileName);
        }
        return state.allFileNames;
    }

    /**
     * Gets the files referenced by the the file path
     */
    export function getReferencedByPaths(state: Readonly<BuilderState>, referencedFilePath: Path): Path[] {
        const keys = state.referencedMap!.getKeys(referencedFilePath);
        return keys ? arrayFrom(keys.keys()) : [];
    }

    /**
     * For script files that contains only ambient external modules, although they are not actually external module files,
     * they can only be consumed via importing elements from them. Regular script files cannot consume them. Therefore,
     * there are no point to rebuild all script files if these special files have changed. However, if any statement
     * in the file is not ambient external module, we treat it as a regular script file.
     */
    function containsOnlyAmbientModules(sourceFile: SourceFile) {
        for (const statement of sourceFile.statements) {
            if (!isModuleWithStringLiteralName(statement)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Return true if file contains anything that augments to global scope we need to build them as if
     * they are global files as well as module
     */
    function containsGlobalScopeAugmentation(sourceFile: SourceFile) {
        return some(sourceFile.moduleAugmentations, augmentation => isGlobalScopeAugmentation(augmentation.parent as ModuleDeclaration));
    }

    /**
     * Return true if the file will invalidate all files because it affectes global scope
     */
    function isFileAffectingGlobalScope(sourceFile: SourceFile) {
        return containsGlobalScopeAugmentation(sourceFile) ||
            !isExternalOrCommonJsModule(sourceFile) && !isJsonSourceFile(sourceFile) && !containsOnlyAmbientModules(sourceFile);
    }

    /**
     * Gets all files of the program excluding the default library file
     */
    export function getAllFilesExcludingDefaultLibraryFile(state: BuilderState, programOfThisState: Program, firstSourceFile: SourceFile | undefined): readonly SourceFile[] {
        // Use cached result
        if (state.allFilesExcludingDefaultLibraryFile) {
            return state.allFilesExcludingDefaultLibraryFile;
        }

        let result: SourceFile[] | undefined;
        if (firstSourceFile) addSourceFile(firstSourceFile);
        for (const sourceFile of programOfThisState.getSourceFiles()) {
            if (sourceFile !== firstSourceFile) {
                addSourceFile(sourceFile);
            }
        }
        state.allFilesExcludingDefaultLibraryFile = result || emptyArray;
        return state.allFilesExcludingDefaultLibraryFile;

        function addSourceFile(sourceFile: SourceFile) {
            if (!programOfThisState.isSourceFileDefaultLibrary(sourceFile)) {
                (result || (result = [])).push(sourceFile);
            }
        }
    }

    /**
     * When program emits non modular code, gets the files affected by the sourceFile whose shape has changed
     */
    function getFilesAffectedByUpdatedShapeWhenNonModuleEmit(state: BuilderState, programOfThisState: Program, sourceFileWithUpdatedShape: SourceFile) {
        const compilerOptions = programOfThisState.getCompilerOptions();
        // If `--out` or `--outFile` is specified, any new emit will result in re-emitting the entire project,
        // so returning the file itself is good enough.
        if (compilerOptions && compilerOptions.outFile) {
            return [sourceFileWithUpdatedShape];
        }
        return getAllFilesExcludingDefaultLibraryFile(state, programOfThisState, sourceFileWithUpdatedShape);
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
  
  
    /**
     * When program emits modular code, gets the files affected by the sourceFile whose shape has changed
     */
    function getFilesAffectedByUpdatedShapeWhenModuleEmit(
        state: BuilderState,
        programOfThisState: Program,
        sourceFileWithUpdatedShape: SourceFile,
        cancellationToken: CancellationToken | undefined,
        host: HostForComputeHash,
    ) {
        if (isFileAffectingGlobalScope(sourceFileWithUpdatedShape)) {
            return getAllFilesExcludingDefaultLibraryFile(state, programOfThisState, sourceFileWithUpdatedShape);
        }

        const compilerOptions = programOfThisState.getCompilerOptions();
        if (compilerOptions && (getIsolatedModules(compilerOptions) || compilerOptions.outFile)) {
            return [sourceFileWithUpdatedShape];
        }

        // Now we need to if each file in the referencedBy list has a shape change as well.
        // Because if so, its own referencedBy files need to be saved as well to make the
        // emitting result consistent with files on disk.
        const seenFileNamesMap = new Map<Path, SourceFile>();

        // Start with the paths this file was referenced by
        seenFileNamesMap.set(sourceFileWithUpdatedShape.resolvedPath, sourceFileWithUpdatedShape);
        const queue = getReferencedByPaths(state, sourceFileWithUpdatedShape.resolvedPath);
        while (queue.length > 0) {
            const currentPath = queue.pop()!;
            if (!seenFileNamesMap.has(currentPath)) {
                const currentSourceFile = programOfThisState.getSourceFileByPath(currentPath)!;
                seenFileNamesMap.set(currentPath, currentSourceFile);
                if (currentSourceFile && updateShapeSignature(state, programOfThisState, currentSourceFile, cancellationToken, host)) {
                    queue.push(...getReferencedByPaths(state, currentSourceFile.resolvedPath));
                }
            }
        }

        // Return array of values that needs emit
        return arrayFrom(mapDefinedIterator(seenFileNamesMap.values(), value => value));
    }
}