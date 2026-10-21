// Only independent lesson steps advance themselves. Persist completion before
// leaving, and let a failed save/navigation reject so the Done button can retry.
export async function finishSoundWallStep({ liveMode, alreadyComplete, saveCompletion, advance }) {
  if (liveMode) return;
  if (!alreadyComplete && !await saveCompletion()) {
    throw new Error('Sound wall completion was not saved.');
  }
  if (advance && await advance() === false) {
    throw new Error('The next activity could not open.');
  }
}
