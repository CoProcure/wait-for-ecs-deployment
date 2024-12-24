import * as core from "@actions/core";
import {
  DeploymentRolloutState,
  DescribeServicesCommand,
  ECSClient,
} from "@aws-sdk/client-ecs";

const ecsClient = new ECSClient({});

enum DeploymentStatus {
  Primary = "PRIMARY",
  Active = "ACTIVE",
  Inactive = "INACTIVE",
}

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function fetchService(cluster: string, service: string) {
  const { services } = await ecsClient.send(
    new DescribeServicesCommand({
      cluster,
      services: [service],
    })
  );

  if (!services?.length) throw Error(`Could not find ${cluster}/${service}`);
  return services[0];
}

async function fetchPrimaryDeployment(cluster: string, service: string) {
  const { deployments } = await fetchService(cluster, service);

  const deployment = deployments?.find(
    ({ status }) => status === DeploymentStatus.Primary
  );
  if (!deployment)
    throw new Error(`No primary deployment found for ${cluster}/${service}`);
  return deployment;
}

async function run() {
  const cluster = core.getInput("cluster", {
    required: true,
  });
  const service = core.getInput("service", {
    required: true,
  });
  const waitForMinutes = Number.parseInt(core.getInput("wait-for-minutes"), 10);

  const waitDurationMs = waitForMinutes * 60 * 1000;
  const waitStart = Date.now();

  core.info(
    `Waiting for primary deployment to complete for ${cluster}/${service}`
  );

  while (true) {
    const deployment = await fetchPrimaryDeployment(cluster, service);
    if (deployment.rolloutState === DeploymentRolloutState.COMPLETED) break;
    if (deployment.rolloutState === DeploymentRolloutState.FAILED) {
      throw new Error(`Previous deployment failed for ${cluster}/${service}`);
    }
    core.debug(`Deployment rollout state: ${deployment.rolloutState}`);

    if (Date.now() - waitStart > waitDurationMs) {
      throw new Error(
        "Timeout reached while waiting for deployment to complete."
      );
    }

    await delay(5000);
  }
  core.info(`Primary deployment completed for ${cluster}/${service}`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => core.setFailed((e as Error).message));
