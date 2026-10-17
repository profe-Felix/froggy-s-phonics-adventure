// Reserved extension switches. None of these features runs or polls in this kit.
export const NOTEBOOK_FEATURES = Object.freeze({
  voiceNotes: false,
  teacherFeedback: false,
  textToSpeech: false,
  assignmentSupports: false,
});
// Future voice capture: audio + timestamped ink/laser events, NOT a video render.
// Future feedback: separate teacher-authored ink/voice/stamps, never rewrite a
// student's audit history. Supports may link to video/anchor-chart/instructions.
// Media storage is a separate later decision; this file grants no storage access.