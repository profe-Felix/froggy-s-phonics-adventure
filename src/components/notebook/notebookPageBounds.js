export function getAssignmentPageBounds(assignment) {
  const total=Math.max(1,Number(assignment?.pdf_page_count||assignment?.page_count||assignment?.page_range_end||1));
  const limited=assignment?.page_mode==='locked'||assignment?.limit_pages;
  const min=limited?Math.max(1,Math.min(total,Number(assignment?.page_range_start||1))):1;
  const max=limited?Math.max(min,Math.min(total,Number(assignment?.page_range_end||total))):total;
  return {total,min,max};
}
export function getEffectiveLockedPage(assignment) {
  const bounds=getAssignmentPageBounds(assignment);
  return Math.max(bounds.min,Math.min(bounds.max,Number(assignment?.locked_page||bounds.min)));
}
export function snapToAllowedPage(targetPage,currentPage,allowedPages) {
  if(!allowedPages?.length||allowedPages.includes(targetPage))return targetPage;
  const min=allowedPages[0],max=allowedPages[allowedPages.length-1];
  const clamped=Math.max(min,Math.min(max,targetPage));
  if(allowedPages.includes(clamped))return clamped;
  return targetPage>currentPage?(allowedPages.find(p=>p>currentPage)??max):([...allowedPages].reverse().find(p=>p<currentPage)??min);
}