export type BiomeTeleportFeedback = {
  kind: 'loading' | 'error';
  message: string;
};

export function getBiomeTeleportFeedback(status: string, destination: string): BiomeTeleportFeedback | null {
  if (status === `Preparing ${destination}…`) {
    return { kind: 'loading', message: `Teleporting to ${destination}…` };
  }

  if (
    status === `Could not find a safe ${destination} location` ||
    status === `No safe location found for ${destination}`
  ) {
    return { kind: 'error', message: 'Teleport failed. Please try again.' };
  }

  return null;
}
