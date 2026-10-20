const TYPES = ['upper_names', 'lower_names', 'upper_sounds', 'lower_sounds', 'sight_words', 'decoding'];
export function assessmentDisplayKey(id) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id || '')) throw new Error('Invalid assessment session.');
  return `assessment:${id}`;
}
export function checkedDisplay(input) {
  if (!input || JSON.stringify(input).length > 4096
    || !Number.isSafeInteger(input.sync_seq) || input.sync_seq < 1
    || typeof input.show_item !== 'boolean') throw new Error('Invalid assessment display.');
  const result = { sync_seq: input.sync_seq, show_item: input.show_item, done: input.done === true };
  if (input.show_item) {
    if (typeof input.current_item !== 'string' || !input.current_item.length || input.current_item.length > 128
      || typeof input.class_name !== 'string' || !input.class_name.trim() || input.class_name.length > 80
      || !Number.isInteger(input.student_number) || input.student_number < 1
      || !Number.isInteger(input.item_index) || input.item_index < 0
      || !Number.isInteger(input.total_items) || input.total_items <= input.item_index
      || !TYPES.includes(input.assessment_type)) throw new Error('Invalid assessment item.');
    Object.assign(result, {
      current_item: input.current_item, class_name: input.class_name,
      student_number: input.student_number, item_index: input.item_index,
      total_items: input.total_items, assessment_type: input.assessment_type,
    });
  }
  if (typeof input.student_id === 'string') result.student_id = input.student_id.slice(0, 100);
  if (typeof input.decoding_level === 'string') result.decoding_level = input.decoding_level.slice(0, 40);
  return result;
}
