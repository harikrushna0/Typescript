import { EventEmitter } from 'events';
import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';

interface SchedulerConfig {
    maxConcurrentJobs: number;
    defaultRetryAttempts: number;
    timeoutSeconds: number;
    timezone: string;
    maxRetries?: number;
    retryDelay?: number;
    healthCheckInterval?: number;
}

interface JobDefinition {
    id: string;
    name: string;
    type: 'cron' | 'interval' | 'once';
    schedule: string;
    handler: string;
    timeout?: number;
    retryAttempts?: number;
    priority: number;
    metadata?: Record<string, any>;
    status?: string;
    lastRun?: Date | null;
    nextRun?: Date | null;
    retryCount?: number;
    chainedJobs?: string[];
    failureHandlerJob?: string;
}

class SchedulerService extends EventEmitter {
    private jobs: Map<string, JobDefinition>;
    private runningJobs: Map<string, JobExecution>;
    private handlers: Map<string, JobHandler>;
    private logger: Logger;
    private metrics: MetricsCollector;
    private config: SchedulerConfig;
    private healthCheck: HealthCheckService;
    private retryPolicy: RetryPolicyService;

    constructor(config: SchedulerConfig) {
        super();
        this.jobs = new Map();
        this.runningJobs = new Map();
        this.handlers = new Map();
        this.config = {
            ...config,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            healthCheckInterval: config.healthCheckInterval || 30000
        };
        this.initializeScheduler();
    }

    private async initializeScheduler(): Promise<void> {
        this.logger = new Logger('SchedulerService');
        this.metrics = new MetricsCollector('scheduler');
        this.healthCheck = new HealthCheckService(this.config);
        this.retryPolicy = new RetryPolicyService(this.config);
        
        await this.loadJobDefinitions();
        await this.registerDefaultHandlers();
        await this.startMetricsCollection();
        await this.initializeHealthChecks();
        this.setupEventListeners();
    }

    private async loadJobDefinitions(): Promise<void> {
        try {
            const storedJobs = await this.db.jobs.findAll();
            for (const job of storedJobs) {
                this.jobs.set(job.id, {
                    ...job,
                    status: 'PENDING',
                    lastRun: null,
                    nextRun: this.calculateNextRun(job)
                });
            }
        } catch (error) {
            this.logger.error('Failed to load job definitions', { error });
            throw error;
        }
    }

    private setupEventListeners(): void {
        this.on('jobCompleted', ({ jobId, result }) => {
            this.handleJobCompletion(jobId, result);
        });

        this.on('jobFailed', ({ jobId, error }) => {
            this.handleJobFailure(jobId, error);
        });

        this.on('healthCheck', (status) => {
            this.handleHealthCheckStatus(status);
        });
    }

    private async handleJobCompletion(jobId: string, result: any): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) return;

        try {
            await this.updateJobStatus(jobId, 'COMPLETED');
            await this.metrics.recordSuccess(jobId);
            await this.calculateAndUpdateNextRun(job);
            await this.notifySubscribers(job, result);
            
            if (job.chainedJobs?.length) {
                await this.triggerChainedJobs(job.chainedJobs);
            }
        } catch (error) {
            this.logger.error('Error handling job completion', { jobId, error });
        }
    }

    private async handleJobFailure(jobId: string, error: Error): Promise<void> {
        const job = this.jobs.get(jobId);
        if (!job) return;

        try {
            const retryDecision = await this.retryPolicy.shouldRetry(job, error);
            
            if (retryDecision.shouldRetry) {
                await this.scheduleRetry(job, retryDecision.delay);
            } else {
                await this.handleFinalFailure(job, error);
            }
            
            await this.metrics.recordFailure(jobId, error);
            await this.notifyAdmins(job, error);
        } catch (secondaryError) {
            this.logger.error('Error handling job failure', { 
                jobId, 
                originalError: error, 
                handlingError: secondaryError 
            });
        }
    }

    private async scheduleRetry(job: JobDefinition, delay: number): Promise<void> {
        const retryJob = {
            ...job,
            retryCount: (job.retryCount || 0) + 1,
            nextRun: new Date(Date.now() + delay),
            status: 'PENDING_RETRY'
        };

        await this.updateJob(job.id, retryJob);
        this.emit('jobScheduledForRetry', { jobId: job.id, retryCount: retryJob.retryCount });
    }

    private async handleFinalFailure(job: JobDefinition, error: Error): Promise<void> {
        await this.updateJobStatus(job.id, 'FAILED');
        await this.metrics.recordFinalFailure(job.id);
        
        if (job.failureHandlerJob) {
            await this.triggerFailureHandler(job, error);
        }

        this.emit('jobFinalFailure', { 
            jobId: job.id, 
            error, 
            attempts: job.retryCount || 1 
        });
    }

    private async calculateAndUpdateNextRun(job: JobDefinition): Promise<void> {
        const nextRun = this.calculateNextRun(job);
        if (nextRun) {
            await this.updateJob(job.id, {
                ...job,
                nextRun,
                lastRun: new Date()
            });
        }
    }

    private calculateNextRun(job: JobDefinition): Date | null {
        switch (job.type) {
            case 'cron':
                return this.calculateNextCronRun(job.schedule);
            case 'interval':
                return new Date(Date.now() + parseInt(job.schedule));
            case 'once':
                return null;
            default:
                throw new Error(`Unsupported job type: ${job.type}`);
        }
    }

    public async scheduleJob(definition: JobDefinition): Promise<string> {
        await this.validateJobDefinition(definition);
        const jobId = definition.id || uuidv4();

        try {
            const job = {
                ...definition,
                id: jobId,
                status: 'scheduled'
            };

            await this.saveJobDefinition(job);
            await this.startJob(job);

            this.emit('jobScheduled', { jobId, definition });
            return jobId;
        } catch (error) {
            await this.handleSchedulingError(error, definition);
            throw error;
        }
    }

    private async validateJobDefinition(job: JobDefinition): Promise<void> {
        const errors: string[] = [];

        if (!job.name) errors.push('Job name is required');
        if (!job.type) errors.push('Job type is required');
        if (!job.schedule) errors.push('Job schedule is required');
        if (!job.handler) errors.push('Job handler is required');

        if (!this.handlers.has(job.handler)) {
            errors.push(`Handler ${job.handler} not registered`);
        }

        if (job.type === 'cron' && !this.isValidCronExpression(job.schedule)) {
            errors.push(`Invalid cron expression: ${job.schedule}`);
        }

        if (errors.length > 0) {
            throw new ValidationError('Invalid job definition', errors);
        }
    }

    private async startJob(job: JobDefinition): Promise<void> {
        switch (job.type) {
            case 'cron':
                await this.startCronJob(job);
                break;
            case 'interval':
                await this.startIntervalJob(job);
                break;
            case 'once':
                await this.startOneTimeJob(job);
                break;
            default:
                throw new Error(`Unsupported job type: ${job.type}`);
        }
    }

    private async startCronJob(job: JobDefinition): Promise<void> {
        const cronJob = new CronJob(
            job.schedule,
            () => this.executeJob(job),
            null,
            true,
            this.config.timezone
        );

        this.runningJobs.set(job.id, {
            definition: job,
            execution: cronJob,
            status: 'running'
        });
    }

    private async executeJob(job: JobDefinition): Promise<void> {
        const executionId = uuidv4();
        const startTime = Date.now();

        try {
            await this.checkConcurrencyLimit();
            const handler = this.handlers.get(job.handler);

            if (!handler) {
                throw new HandlerNotFoundError(`Handler ${job.handler} not found`);
            }

            const context = this.createExecutionContext(job, executionId);
            const result = await this.executeWithTimeout(
                () => handler.execute(context),
                job.timeout || this.config.timeoutSeconds * 1000
            );

            await this.handleJobSuccess(job, executionId, result, startTime);
        } catch (error) {
            await this.handleJobError(job, executionId, error, startTime);
        }
    }

    private async checkConcurrencyLimit(): Promise<void> {
        const runningCount = Array.from(this.runningJobs.values())
            .filter(job => job.status === 'running')
            .length;

        if (runningCount >= this.config.maxConcurrentJobs) {
            throw new ConcurrencyError('Maximum concurrent jobs limit reached');
        }
    }

    private async executeWithTimeout<T>(
        operation: () => Promise<T>,
        timeout: number
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new TimeoutError('Job execution timed out'));
            }, timeout);

            operation()
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    private async handleJobSuccess(
        job: JobDefinition,
        executionId: string,
        result: any,
        startTime: number
    ): Promise<void> {
        const duration = Date.now() - startTime;

        await this.metrics.recordJobExecution({
            jobId: job.id,
            executionId,
            duration,
            success: true
        });

        this.emit('jobCompleted', {
            jobId: job.id,
            executionId,
            duration,
            result
        });
    }

    private async handleJobError(
        job: JobDefinition,
        executionId: string,
        error: Error,
        startTime: number
    ): Promise<void> {
        const duration = Date.now() - startTime;

        this.logger.error(`Job execution failed`, {
            jobId: job.id,
            executionId,
            error: error.message,
            duration
        });

        await this.metrics.recordJobExecution({
            jobId: job.id,
            executionId,
            duration,
            success: false,
            error: error.message
        });

        if (this.shouldRetryJob(job, error)) {
            await this.retryJob(job, executionId);
        } else {
            this.emit('jobFailed', {
                jobId: job.id,
                executionId,
                error,
                duration
            });
        }
    }

    public async pauseJob(jobId: string): Promise<void> {
        const job = this.runningJobs.get(jobId);
        if (!job) {
            throw new JobNotFoundError(`Job ${jobId} not found`);
        }

        job.execution.stop();
        job.status = 'paused';

        await this.updateJobStatus(jobId, 'paused');
        this.emit('jobPaused', { jobId });
    }

    public async resumeJob(jobId: string): Promise<void> {
        const job = this.runningJobs.get(jobId);
        if (!job) {
            throw new JobNotFoundError(`Job ${jobId} not found`);
        }

        if (job.status !== 'paused') {
            throw new InvalidStateError(`Job ${jobId} is not paused`);
        }

        job.execution.start();
        job.status = 'running';

        await this.updateJobStatus(jobId, 'running');
        this.emit('jobResumed', { jobId });
    }

    public async getJobStats(jobId: string): Promise<JobStats> {
        const executions = await this.metrics.getJobExecutions(jobId);
        
        return {
            totalExecutions: executions.length,
            successCount: executions.filter(e => e.success).length,
            failureCount: executions.filter(e => !e.success).length,
            averageDuration: this.calculateAverageDuration(executions),
            lastExecution: executions[executions.length - 1],
            status: this.getJobStatus(jobId)
        };
    }
}

export default SchedulerService;

// Experimental
{
    name: "experimentalDecorators",
    type: "boolean",
    affectsEmit: true,
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Language_and_Environment,
    description: Diagnostics.Enable_experimental_support_for_legacy_experimental_decorators,
    defaultValueDescription: false,
},
{
    name: "emitDecoratorMetadata",
    type: "boolean",
    affectsSemanticDiagnostics: true,
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Language_and_Environment,
    description: Diagnostics.Emit_design_type_metadata_for_decorated_declarations_in_source_files,
    defaultValueDescription: false,
},

// Advanced
{
    name: "jsxFactory",
    type: "string",
    category: Diagnostics.Language_and_Environment,
    description: Diagnostics.Specify_the_JSX_factory_function_used_when_targeting_React_JSX_emit_e_g_React_createElement_or_h,
    defaultValueDescription: "`React.createElement`",
},
{
    name: "jsxFragmentFactory",
    type: "string",
    category: Diagnostics.Language_and_Environment,
    description: Diagnostics.Specify_the_JSX_Fragment_reference_used_for_fragments_when_targeting_React_JSX_emit_e_g_React_Fragment_or_Fragment,
    defaultValueDescription: "React.Fragment",
},
{
    name: "jsxImportSource",
    type: "string",
    affectsSemanticDiagnostics: true,
    affectsEmit: true,
    affectsBuildInfo: true,
    affectsModuleResolution: true,
    affectsSourceFile: true,
    category: Diagnostics.Language_and_Environment,
    description: Diagnostics.Specify_module_specifier_used_to_import_the_JSX_factory_functions_when_using_jsx_Colon_react_jsx_Asterisk,
    defaultValueDescription: "react",
},
{
    name: "resolveJsonModule",
    type: "boolean",
    affectsModuleResolution: true,
    category: Diagnostics.Modules,
    description: Diagnostics.Enable_importing_json_files,
    defaultValueDescription: false,
},
{
    name: "allowArbitraryExtensions",
    type: "boolean",
    affectsProgramStructure: true,
    category: Diagnostics.Modules,
    description: Diagnostics.Enable_importing_files_with_any_extension_provided_a_declaration_file_is_present,
    defaultValueDescription: false,
},

{
    name: "out",
    type: "string",
    affectsEmit: true,
    affectsBuildInfo: true,
    affectsDeclarationPath: true,
    isFilePath: false, // This is intentionally broken to support compatibility with existing tsconfig files
    // for correct behaviour, please use outFile
    category: Diagnostics.Backwards_Compatibility,
    paramType: Diagnostics.FILE,
    transpileOptionValue: undefined,
    description: Diagnostics.Deprecated_setting_Use_outFile_instead,
},
{
    name: "reactNamespace",
    type: "string",
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Language_and_Environment,
    description: Diagnostics.Specify_the_object_invoked_for_createElement_This_only_applies_when_targeting_react_JSX_emit,
    defaultValueDescription: "`React`",
},
{
    name: "skipDefaultLibCheck",
    type: "boolean",
    // We need to store these to determine whether `lib` files need to be rechecked
    affectsBuildInfo: true,
    category: Diagnostics.Completeness,
    description: Diagnostics.Skip_type_checking_d_ts_files_that_are_included_with_TypeScript,
    defaultValueDescription: false,
},
{
    name: "charset",
    type: "string",
    category: Diagnostics.Backwards_Compatibility,
    description: Diagnostics.No_longer_supported_In_early_versions_manually_set_the_text_encoding_for_reading_files,
    defaultValueDescription: "utf8",
},
{
    name: "emitBOM",
    type: "boolean",
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Emit,
    description: Diagnostics.Emit_a_UTF_8_Byte_Order_Mark_BOM_in_the_beginning_of_output_files,
    defaultValueDescription: false,
},
{
    name: "newLine",
    type: new Map(Object.entries({
        crlf: NewLineKind.CarriageReturnLineFeed,
        lf: NewLineKind.LineFeed,
    })),
    affectsEmit: true,
    affectsBuildInfo: true,
    paramType: Diagnostics.NEWLINE,
    category: Diagnostics.Emit,
    description: Diagnostics.Set_the_newline_character_for_emitting_files,
    defaultValueDescription: "lf",
},
{
    name: "noErrorTruncation",
    type: "boolean",
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Output_Formatting,
    description: Diagnostics.Disable_truncating_types_in_error_messages,
    defaultValueDescription: false,
},
{
    name: "noLib",
    type: "boolean",
    category: Diagnostics.Language_and_Environment,
    affectsProgramStructure: true,
    description: Diagnostics.Disable_including_any_library_files_including_the_default_lib_d_ts,
    // We are not returning a sourceFile for lib file when asked by the program,
    // so pass --noLib to avoid reporting a file not found error.
    transpileOptionValue: true,
    defaultValueDescription: false,
},
{
    name: "noResolve",
    type: "boolean",
    affectsModuleResolution: true,
    category: Diagnostics.Modules,
    description: Diagnostics.Disallow_import_s_require_s_or_reference_s_from_expanding_the_number_of_files_TypeScript_should_add_to_a_project,
    // We are not doing a full typecheck, we are not resolving the whole context,
    // so pass --noResolve to avoid reporting missing file errors.
    transpileOptionValue: true,
    defaultValueDescription: false,
},
{
    name: "stripInternal",
    type: "boolean",
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Emit,
    description: Diagnostics.Disable_emitting_declarations_that_have_internal_in_their_JSDoc_comments,
    defaultValueDescription: false,
},
{
    name: "disableSizeLimit",
    type: "boolean",
    affectsProgramStructure: true,
    category: Diagnostics.Editor_Support,
    description: Diagnostics.Remove_the_20mb_cap_on_total_source_code_size_for_JavaScript_files_in_the_TypeScript_language_server,
    defaultValueDescription: false,
},
{
    name: "disableSourceOfProjectReferenceRedirect",
    type: "boolean",
    isTSConfigOnly: true,
    category: Diagnostics.Projects,
    description: Diagnostics.Disable_preferring_source_files_instead_of_declaration_files_when_referencing_composite_projects,
    defaultValueDescription: false,
},
{
    name: "disableSolutionSearching",
    type: "boolean",
    isTSConfigOnly: true,
    category: Diagnostics.Projects,
    description: Diagnostics.Opt_a_project_out_of_multi_project_reference_checking_when_editing,
    defaultValueDescription: false,
},
{
    name: "disableReferencedProjectLoad",
    type: "boolean",
    isTSConfigOnly: true,
    category: Diagnostics.Projects,
    description: Diagnostics.Reduce_the_number_of_projects_loaded_automatically_by_TypeScript,
    defaultValueDescription: false,
},
{
    name: "noImplicitUseStrict",
    type: "boolean",
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Backwards_Compatibility,
    description: Diagnostics.Disable_adding_use_strict_directives_in_emitted_JavaScript_files,
    defaultValueDescription: false,
},
{
    name: "noEmitHelpers",
    type: "boolean",
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Emit,
    description: Diagnostics.Disable_generating_custom_helper_functions_like_extends_in_compiled_output,
    defaultValueDescription: false,
},
{
    name: "noEmitOnError",
    type: "boolean",
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Emit,
    transpileOptionValue: undefined,
    description: Diagnostics.Disable_emitting_files_if_any_type_checking_errors_are_reported,
    defaultValueDescription: false,
},
{
    name: "preserveConstEnums",
    type: "boolean",
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Emit,
    description: Diagnostics.Disable_erasing_const_enum_declarations_in_generated_code,
    defaultValueDescription: false,
},
{
    name: "declarationDir",
    type: "string",
    affectsEmit: true,
    affectsBuildInfo: true,
    affectsDeclarationPath: true,
    isFilePath: true,
    paramType: Diagnostics.DIRECTORY,
    category: Diagnostics.Emit,
    transpileOptionValue: undefined,
    description: Diagnostics.Specify_the_output_directory_for_generated_declaration_files,
},
{
    name: "skipLibCheck",
    type: "boolean",
    // We need to store these to determine whether `lib` files need to be rechecked
    affectsBuildInfo: true,
    category: Diagnostics.Completeness,
    description: Diagnostics.Skip_type_checking_all_d_ts_files,
    defaultValueDescription: false,
},
{
    name: "allowUnusedLabels",
    type: "boolean",
    affectsBindDiagnostics: true,
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Type_Checking,
    description: Diagnostics.Disable_error_reporting_for_unused_labels,
    defaultValueDescription: undefined,
},
{
    name: "allowUnreachableCode",
    type: "boolean",
    affectsBindDiagnostics: true,
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Type_Checking,
    description: Diagnostics.Disable_error_reporting_for_unreachable_code,
    defaultValueDescription: undefined,
},
{
    name: "suppressExcessPropertyErrors",
    type: "boolean",
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Backwards_Compatibility,
    description: Diagnostics.Disable_reporting_of_excess_property_errors_during_the_creation_of_object_literals,
    defaultValueDescription: false,
},
{
    name: "suppressImplicitAnyIndexErrors",
    type: "boolean",
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Backwards_Compatibility,
    description: Diagnostics.Suppress_noImplicitAny_errors_when_indexing_objects_that_lack_index_signatures,
    defaultValueDescription: false,
},
{
    name: "forceConsistentCasingInFileNames",
    type: "boolean",
    affectsModuleResolution: true,
    category: Diagnostics.Interop_Constraints,
    description: Diagnostics.Ensure_that_casing_is_correct_in_imports,
    defaultValueDescription: true,
},
{
    name: "maxNodeModuleJsDepth",
    type: "number",
    affectsModuleResolution: true,
    category: Diagnostics.JavaScript_Support,
    description: Diagnostics.Specify_the_maximum_folder_depth_used_for_checking_JavaScript_files_from_node_modules_Only_applicable_with_allowJs,
    defaultValueDescription: 0,
},
{
    name: "noStrictGenericChecks",
    type: "boolean",
    affectsSemanticDiagnostics: true,
    affectsBuildInfo: true,
    category: Diagnostics.Backwards_Compatibility,
    description: Diagnostics.Disable_strict_checking_of_generic_signatures_in_function_types,
    defaultValueDescription: false,
},
{
    name: "useDefineForClassFields",
    type: "boolean",
    affectsSemanticDiagnostics: true,
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Language_and_Environment,
    description: Diagnostics.Emit_ECMAScript_standard_compliant_class_fields,
    defaultValueDescription: Diagnostics.true_for_ES2022_and_above_including_ESNext,
},
{
    name: "preserveValueImports",
    type: "boolean",
    affectsEmit: true,
    affectsBuildInfo: true,
    category: Diagnostics.Backwards_Compatibility,
    description: Diagnostics.Preserve_unused_imported_values_in_the_JavaScript_output_that_would_otherwise_be_removed,
    defaultValueDescription: false,
},

{
    name: "keyofStringsOnly",
    type: "boolean",
    category: Diagnostics.Backwards_Compatibility,
    description: Diagnostics.Make_keyof_only_return_strings_instead_of_string_numbers_or_symbols_Legacy_option,
    defaultValueDescription: false,
},
{
    // A list of plugins to load in the language service
    name: "plugins",
    type: "list",
    isTSConfigOnly: true,
    element: {
        name: "plugin",
        type: "object",
    },
    description: Diagnostics.Specify_a_list_of_language_service_plugins_to_include,
    category: Diagnostics.Editor_Support,
},
{
    name: "moduleDetection",
    type: new Map(Object.entries({
        auto: ModuleDetectionKind.Auto,
        legacy: ModuleDetectionKind.Legacy,
        force: ModuleDetectionKind.Force,
    })),
    affectsSourceFile: true,
    affectsModuleResolution: true,
    description: Diagnostics.Control_what_method_is_used_to_detect_module_format_JS_files,
    category: Diagnostics.Language_and_Environment,
    defaultValueDescription: Diagnostics.auto_Colon_Treat_files_with_imports_exports_import_meta_jsx_with_jsx_Colon_react_jsx_or_esm_format_with_module_Colon_node16_as_modules,
},
{
    name: "ignoreDeprecations",
    type: "string",
    defaultValueDescription: undefined,
},
];

// Do not delete this without updating the website's tsconfig generation.
/** @internal */
export const optionDeclarations: CommandLineOption[] = [
...commonOptionsWithBuild,
...commandOptionsWithoutBuild,
];

/** @internal */
export const semanticDiagnosticsOptionDeclarations: readonly CommandLineOption[] = optionDeclarations.filter(option => !!option.affectsSemanticDiagnostics);

/** @internal */
export const affectsEmitOptionDeclarations: readonly CommandLineOption[] = optionDeclarations.filter(option => !!option.affectsEmit);

/** @internal */
export const affectsDeclarationPathOptionDeclarations: readonly CommandLineOption[] = optionDeclarations.filter(option => !!option.affectsDeclarationPath);

/** @internal */
export const moduleResolutionOptionDeclarations: readonly CommandLineOption[] = optionDeclarations.filter(option => !!option.affectsModuleResolution);

/** @internal */
export const sourceFileAffectingCompilerOptions: readonly CommandLineOption[] = optionDeclarations.filter(option => !!option.affectsSourceFile || !!option.affectsBindDiagnostics);

/** @internal */
export const optionsAffectingProgramStructure: readonly CommandLineOption[] = optionDeclarations.filter(option => !!option.affectsProgramStructure);

/** @internal */
export const transpileOptionValueCompilerOptions: readonly CommandLineOption[] = optionDeclarations.filter(option => hasProperty(option, "transpileOptionValue"));

const configDirTemplateSubstitutionOptions: readonly CommandLineOption[] = optionDeclarations.filter(
option => option.allowConfigDirTemplateSubstitution || (!option.isCommandLineOnly && option.isFilePath),
);

const configDirTemplateSubstitutionWatchOptions: readonly CommandLineOption[] = optionsForWatch.filter(
option => option.allowConfigDirTemplateSubstitution || (!option.isCommandLineOnly && option.isFilePath),
);

/** @internal */
export const commandLineOptionOfCustomType: readonly CommandLineOptionOfCustomType[] = optionDeclarations.filter(isCommandLineOptionOfCustomType);
function isCommandLineOptionOfCustomType(option: CommandLineOption): option is CommandLineOptionOfCustomType {
return !isString(option.type);
}

/** @internal */
export const tscBuildOption: CommandLineOption = {
name: "build",
type: "boolean",
shortName: "b",
showInSimplifiedHelpView: true,
category: Diagnostics.Command_line_Options,
description: Diagnostics.Build_one_or_more_projects_and_their_dependencies_if_out_of_date,
defaultValueDescription: false,
};

// Build related options
/** @internal */
export const optionsForBuild: CommandLineOption[] = [
tscBuildOption,
{
    name: "verbose",
    shortName: "v",
    category: Diagnostics.Command_line_Options,
    description: Diagnostics.Enable_verbose_logging,
    type: "boolean",
    defaultValueDescription: false,
},
{
    name: "dry",
    shortName: "d",
    category: Diagnostics.Command_line_Options,
    description: Diagnostics.Show_what_would_be_built_or_deleted_if_specified_with_clean,
    type: "boolean",
    defaultValueDescription: false,
},
{
    name: "force",
    shortName: "f",
    category: Diagnostics.Command_line_Options,
    description: Diagnostics.Build_all_projects_including_those_that_appear_to_be_up_to_date,
    type: "boolean",
    defaultValueDescription: false,
},
{
    name: "clean",
    category: Diagnostics.Command_line_Options,
    description: Diagnostics.Delete_the_outputs_of_all_projects,
    type: "boolean",
    defaultValueDescription: false,
},
{
    name: "stopBuildOnErrors",
    category: Diagnostics.Command_line_Options,
    description: Diagnostics.Skip_building_downstream_projects_on_error_in_upstream_project,
    type: "boolean",
    defaultValueDescription: false,
},
];
export const buildOpts: CommandLineOption[] = [
    ...commonOptionsWithBuild,
    ...optionsForBuild,
];

// Do not delete this without updating the website's tsconfig generation.
/** @internal */
export const typeAcquisitionDeclarations: CommandLineOption[] = [
    {
        name: "enable",
        type: "boolean",
        defaultValueDescription: false,
    },
    {
        name: "include",
        type: "list",
        element: {
            name: "include",
            type: "string",
        },
    },
    {
        name: "exclude",
        type: "list",
        element: {
            name: "exclude",
            type: "string",
        },
    },
    {
        name: "disableFilenameBasedTypeAcquisition",
        type: "boolean",
        defaultValueDescription: false,
    },
];

/** @internal */
export interface OptionsNameMap {
    optionsNameMap: Map<string, CommandLineOption>;
    shortOptionNames: Map<string, string>;
}

/** @internal */
export function createOptionNameMap(optionDeclarations: readonly CommandLineOption[]): OptionsNameMap {
    const optionsNameMap = new Map<string, CommandLineOption>();
    const shortOptionNames = new Map<string, string>();
    forEach(optionDeclarations, option => {
        optionsNameMap.set(option.name.toLowerCase(), option);
        if (option.shortName) {
            shortOptionNames.set(option.shortName, option.name);
        }
    });

    return { optionsNameMap, shortOptionNames };
}

let optionsNameMapCache: OptionsNameMap;

/** @internal */
export function getOptionsNameMap(): OptionsNameMap {
    return optionsNameMapCache ||= createOptionNameMap(optionDeclarations);
}

const compilerOptionsAlternateMode: AlternateModeDiagnostics = {
    diagnostic: Diagnostics.Compiler_option_0_may_only_be_used_with_build,
    getOptionsNameMap: getBuildOptionsNameMap,
};

// Do not delete this without updating the website's tsconfig generation.
/** @internal @knipignore */
export const defaultInitCompilerOptions: CompilerOptions = {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2016,
    strict: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: true,
};

/** @internal */
export function createCompilerDiagnosticForInvalidCustomType(opt: CommandLineOptionOfCustomType): Diagnostic {
    return createDiagnosticForInvalidCustomType(opt, createCompilerDiagnostic);
}

function createDiagnosticForInvalidCustomType(opt: CommandLineOptionOfCustomType, createDiagnostic: (message: DiagnosticMessage, ...args: DiagnosticArguments) => Diagnostic): Diagnostic {
    const namesOfType = arrayFrom(opt.type.keys());
    const stringNames = (opt.deprecatedKeys ? namesOfType.filter(k => !opt.deprecatedKeys!.has(k)) : namesOfType).map(key => `'${key}'`).join(", ");
    return createDiagnostic(Diagnostics.Argument_for_0_option_must_be_Colon_1, `--${opt.name}`, stringNames);
}

/** @internal */
export function parseCustomTypeOption(opt: CommandLineOptionOfCustomType, value: string | undefined, errors: Diagnostic[]): string | number | undefined {
    return convertJsonOptionOfCustomType(opt, (value ?? "").trim(), errors);
}

/** @internal */
export function parseListTypeOption(opt: CommandLineOptionOfListType, value = "", errors: Diagnostic[]): string | (string | number)[] | undefined {
    value = value.trim();
    if (startsWith(value, "-")) {
        return undefined;
    }
    if (opt.type === "listOrElement" && !value.includes(",")) {
        return validateJsonOptionValue(opt, value, errors);
    }
    if (value === "") {
        return [];
    }
    const values = value.split(",");
    switch (opt.element.type) {
        case "number":
            return mapDefined(values, v => validateJsonOptionValue(opt.element, parseInt(v), errors));
        case "string":
            return mapDefined(values, v => validateJsonOptionValue(opt.element, v || "", errors));
        case "boolean":
        case "object":
            return Debug.fail(`List of ${opt.element.type} is not yet supported.`);
        default:
            return mapDefined(values, v => parseCustomTypeOption(opt.element as CommandLineOptionOfCustomType, v, errors));
    }
}

/** @internal */
export interface OptionsBase {
    [option: string]: CompilerOptionsValue | TsConfigSourceFile | undefined;
}

/** @internal */
export interface BaseParsedCommandLine {
    options: OptionsBase;
    watchOptions: WatchOptions | undefined;
    fileNames: string[];
    errors: Diagnostic[];
}

/** @internal */
export interface ParseCommandLineWorkerDiagnostics extends DidYouMeanOptionsDiagnostics {
    getOptionsNameMap: () => OptionsNameMap;
    optionTypeMismatchDiagnostic: DiagnosticMessage;
}

function getOptionName(option: CommandLineOption) {
    return option.name;
}

function createUnknownOptionError(
    unknownOption: string,
    diagnostics: DidYouMeanOptionsDiagnostics,
    unknownOptionErrorText?: string,
    node?: PropertyName,
    sourceFile?: TsConfigSourceFile,
) {
    const otherOption = diagnostics.alternateMode?.getOptionsNameMap().optionsNameMap.get(unknownOption.toLowerCase());
    if (otherOption) {
        return createDiagnosticForNodeInSourceFileOrCompilerDiagnostic(
            sourceFile,
            node,
            otherOption !== tscBuildOption ?
                diagnostics.alternateMode!.diagnostic :
                Diagnostics.Option_build_must_be_the_first_command_line_argument,
            unknownOption,
        );
    }

    const possibleOption = getSpellingSuggestion(unknownOption, diagnostics.optionDeclarations, getOptionName);
    return possibleOption ?
        createDiagnosticForNodeInSourceFileOrCompilerDiagnostic(sourceFile, node, diagnostics.unknownDidYouMeanDiagnostic, unknownOptionErrorText || unknownOption, possibleOption.name) :
        createDiagnosticForNodeInSourceFileOrCompilerDiagnostic(sourceFile, node, diagnostics.unknownOptionDiagnostic, unknownOptionErrorText || unknownOption);
}

/** @internal */
export function parseCommandLineWorker(
    diagnostics: ParseCommandLineWorkerDiagnostics,
    commandLine: readonly string[],
    readFile?: (path: string) => string | undefined,
): BaseParsedCommandLine {
    const options = {} as OptionsBase;
    let watchOptions: WatchOptions | undefined;
    const fileNames: string[] = [];
    const errors: Diagnostic[] = [];

    parseStrings(commandLine);
    return {
        options,
        watchOptions,
        fileNames,
        errors,
    };

    function parseStrings(args: readonly string[]) {
        let i = 0;
        while (i < args.length) {
            const s = args[i];
            i++;
            if (s.charCodeAt(0) === CharacterCodes.at) {
                parseResponseFile(s.slice(1));
            }
            else if (s.charCodeAt(0) === CharacterCodes.minus) {
                const inputOptionName = s.slice(s.charCodeAt(1) === CharacterCodes.minus ? 2 : 1);
                const opt = getOptionDeclarationFromName(diagnostics.getOptionsNameMap, inputOptionName, /*allowShort*/ true);
                if (opt) {
                    i = parseOptionValue(args, i, diagnostics, opt, options, errors);
                }
                else {
                    const watchOpt = getOptionDeclarationFromName(watchOptionsDidYouMeanDiagnostics.getOptionsNameMap, inputOptionName, /*allowShort*/ true);
                    if (watchOpt) {
                        i = parseOptionValue(args, i, watchOptionsDidYouMeanDiagnostics, watchOpt, watchOptions || (watchOptions = {}), errors);
                    }
                    else {
                        errors.push(createUnknownOptionError(inputOptionName, diagnostics, s));
                    }
                }
            }
            else {
                fileNames.push(s);
            }
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
  
  
    function parseResponseFile(fileName: string) {
        const text = tryReadFile(fileName, readFile || (fileName => sys.readFile(fileName)));
        if (!isString(text)) {
            errors.push(text);
            return;
        }

        const args: string[] = [];
        let pos = 0;
        while (true) {
            while (pos < text.length && text.charCodeAt(pos) <= CharacterCodes.space) pos++;
            if (pos >= text.length) break;
            const start = pos;
            if (text.charCodeAt(start) === CharacterCodes.doubleQuote) {
                pos++;
                while (pos < text.length && text.charCodeAt(pos) !== CharacterCodes.doubleQuote) pos++;
                if (pos < text.length) {
                    args.push(text.substring(start + 1, pos));
                    pos++;
                }
                else {
                    errors.push(createCompilerDiagnostic(Diagnostics.Unterminated_quoted_string_in_response_file_0, fileName));
                }
            }
            else {
                while (text.charCodeAt(pos) > CharacterCodes.space) pos++;
                args.push(text.substring(start, pos));
            }
        }
        parseStrings(args);
    }
}
