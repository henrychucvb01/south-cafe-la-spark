import {combinedReviewComments,generalReviewComment} from './reviewComments';
test('location comments join the main comments once with matching PDF marker numbers',()=>{
 const marks=[{type:'comment',text:'Time is incorrect.',page:1},{type:'draw'},{type:'comment',text:'Check signature.',page:2}];
 const combined=combinedReviewComments('Please correct these items.',marks);
 expect(combined).toBe('Please correct these items.\n\nPDF location comments:\n1. Time is incorrect. (Page 1)\n3. Check signature. (Page 2)');
 expect(combinedReviewComments(combined,marks)).toBe(combined);
 expect(generalReviewComment(combined)).toBe('Please correct these items.');
 expect(combinedReviewComments(combined,[])).toBe('Please correct these items.');
});
test('location comments alone are a valid return explanation and can be cleared',()=>{
 const combined=combinedReviewComments('',[{type:'comment',text:'Time is incorrect.',page:1}]);
 expect(combined).toContain('1. Time is incorrect.');expect(generalReviewComment(combined)).toBe('');expect(combinedReviewComments('',[])).toBe('');
});
