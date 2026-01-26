import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
/**
 * Initialize OpenTelemetry with Prometheus exporter
 * Based on Claude Code's telemetry configuration
 */
export declare function initializeTelemetry(enabled: boolean, port?: number): void;
/**
 * Get the meter provider instance
 */
export declare function getMeterProvider(): MeterProvider | null;
/**
 * Get the Prometheus exporter instance
 */
export declare function getPrometheusExporter(): PrometheusExporter | null;
/**
 * Shutdown telemetry gracefully
 */
export declare function shutdownTelemetry(): Promise<void>;
//# sourceMappingURL=telemetry.d.ts.map