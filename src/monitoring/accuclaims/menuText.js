const omittedItem=/^(?:special diet\b|ketchup\b|mustard\b|mayonnaise\b|mayo\b|(?:sriracha|taco|tapatio|hot|bbq|barbecue)\b.*\bsauce\b|tajin\b|(?:ranch|italian|caesar|balsamic) dressing\b|relish\b|soy sauce\b|salad dressing\b)|\b(?:seasoning packet|condiment packet)\b/i;

export function omitMenuItem(name){
 return omittedItem.test(name.trim());
}

export function cleanMenuText(menu){
 // Older saved menus separated portions with commas. Keep commas within food names.
 return (menu||'').split(/\r?\n|(?<=\)),\s*/).map(item=>item.trim())
  .filter(item=>item&&!omitMenuItem(item)).join('\n');
}
