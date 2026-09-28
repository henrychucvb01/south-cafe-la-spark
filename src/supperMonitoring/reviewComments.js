const heading='PDF location comments:';
export function generalReviewComment(value='') {
 const index=value.lastIndexOf('\n\n'+heading+'\n');
 if(index>=0)return value.slice(0,index);
 return value.startsWith(heading+'\n')?'':value;
}
export function combinedReviewComments(comment,annotations=[]) {
 const lines=annotations.flatMap((mark,index)=>mark.type==='comment'?[`${index+1}. ${mark.text} (Page ${mark.page})`]:[]);
 return [generalReviewComment(comment).trim(),lines.length?heading+'\n'+lines.join('\n'):''].filter(Boolean).join('\n\n');
}
