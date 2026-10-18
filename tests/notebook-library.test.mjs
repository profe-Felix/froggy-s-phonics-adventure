import assert from "node:assert/strict";
import test from "node:test";
import { notebookLibrary, resolveNotebookAssignment, notebookLibraryFamily } from "../src/lib/notebook-library.mjs";
const records = [
  {id:"fx",created_date:"2026-01-01",title:"Book",class_name:"Felix",status:"active",shared_across_classes:true,library_key:"same"},
  {id:"va",created_date:"2026-02-01",title:"Book",class_name:"Valero",status:"active",shared_across_classes:true,library_key:"same"},
  {id:"different",created_date:"2026-03-01",title:"Book",class_name:"Felix",status:"active",shared_across_classes:true,library_key:"different"},
];
test("one library card per document, retaining each class's historical work identity", () => {
  assert.deepEqual(notebookLibrary(records,"Felix").map(x=>x.id),["fx","different"]);
  assert.deepEqual(notebookLibrary(records,"Valero").map(x=>x.id),["va","different"]);
  assert.equal(notebookLibraryFamily(records,records[0]).length,2);
});
test("title-only lessons auto-open while exact saved IDs never get remapped to a different copy", () => {
  assert.equal(resolveNotebookAssignment(records,{className:"Felix",title:"  BOOK "}).id,"fx");
  assert.equal(resolveNotebookAssignment(records,{className:"Felix",id:"va"}).id,"va");
  assert.equal(resolveNotebookAssignment(records,{className:"Felix",id:"missing"}),undefined);
  assert.equal(resolveNotebookAssignment([{...records[0],status:"draft"}],{className:"Felix",title:"Book",allowDraft:true}).id,"fx");
});
