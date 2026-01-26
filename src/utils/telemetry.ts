import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { logger } from './logger.js';

let meterProvider: MeterProvider | null = null;
let prometheusExporter: PrometheusExporter | null = null;

/**
 * Initialize OpenTelemetry with Prometheus exporter
 * Based on Claude Code's telemetry configuration
 */
export function initializeTelemetry(enabled: boolean, port: number = 9464): void {
  if (!enabled) {
    logger.info('Telemetry is disabled');
    return;
  }

  try {
    // Get version from package.json
    const version = process.env.npm_package_version || '1.0.0';

    // Create resource with service information
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'claude-agentapi',
      [ATTR_SERVICE_VERSION]: version,
      'os.type': process.platform,
      'os.version': process.version,
      'host.arch': process.arch,
    });

    // Create Prometheus exporter
    prometheusExporter = new PrometheusExporter(
      {
        port,
        endpoint: '/metrics',
      },
      () => {
        logger.info(`Prometheus metrics server running on port ${port}`);
      }
    );

    // Create meter provider
    meterProvider = new MeterProvider({
      resource,
      readers: [prometheusExporter],
    });

    logger.info('OpenTelemetry initialized with Prometheus exporter');
  } catch (error) {
    logger.error('Failed to initialize telemetry:', error);
    throw error;
  }
}

/**
 * Get the meter provider instance
 */
export function getMeterProvider(): MeterProvider | null {
  return meterProvider;
}

/**
 * Get the Prometheus exporter instance
 */
export function getPrometheusExporter(): PrometheusExporter | null {
  return prometheusExporter;
}

/**
 * Shutdown telemetry gracefully
 */
export async function shutdownTelemetry(): Promise<void> {
  if (meterProvider) {
    await meterProvider.shutdown();
    logger.info('Telemetry shutdown complete');
  }
}
