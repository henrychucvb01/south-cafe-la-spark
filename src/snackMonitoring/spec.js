// SNP-24, supplied EEC Snack Site Monitoring 2024-02-06.
export const COMPONENTS = {milk:'Milk',meat:'Meat / alternate',grain:'Grain / bread',produce:'Vegetable / fruit'};
const texts = [
 'Is the snack meal pattern chart with required portion sizes available at this site?',
 'Does the menu as served meet the snack requirements?',
 'Is enough food available to provide each child with required portions?',
 'Does the written menu match what was served today?',
 'Is a menu production record (MPR) completed for all snacks prepared? (on-site prep)',
 'If meals are transported, was a food transport record completed? (satellite site)',
 'Are all meals consumed on site / under staff supervision?',
 'Are daily roster / attendance records current and accurate?',
 'Is an acceptable method used for collecting and recording accurate meal counts?',
 'Is the number of children in care within the license / room capacity (if applicable)?',
 'Are meal counts within license / room capacity (if applicable)?',
 'For non-area-eligible sites, is a complete and correct eligibility application on file for each child claimed for free and reduced snacks?',
 'Are snacks served only to enrolled children?',
 'Is a structured education / enrichment program observed?',
 'Is a civil rights poster placed in a prominent location at this site?',
 'Is this site safe and sanitary?',
 'Does this visit indicate that training is necessary at this site?'
];
export const SNACK_QUESTIONS=texts.map((text,i)=>({id:String(i+1),text,section:i===14?0:i<7||i===12?1:i<12||i===13?2:3,options:[5,6,10,11,12].includes(i+1)?['Yes','No','N/A']:['Yes','No'],trigger:i===16?'Yes':'No'}));
export const snackDefaults=()=>({program:'eec-snack',meal:'Snack',areaEligible:'',servingTime:'',attendance:'',capacity:'',capacityNA:false,children:'',adults:'',applications:{},claimed:{},components:{},training:''});
export function validateSnack(d,add){
 if(d.meal!=='Snack')add(0,'Choose the Snack monitoring form.');
 if(!['Yes','No'].includes(d.areaEligible))add(0,'Answer whether the site is area eligible.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.servingTime||''))add(1,'Enter the snack serving time.');
 const count=(value,label)=>{if(!/^\d{1,6}$/.test(String(value??'')))add(1,`Enter a whole-number ${label}, including zero when applicable.`);};
 for(const key of ['attendance','children','adults'])count(d[key],key+' count');
 if(!d.capacityNA)count(d.capacity,'license / room capacity');
 if(d.areaEligible==='No')for(const key of ['free','reduced','paid']){count(d.applications?.[key],`${key} approved applications`);count(d.claimed?.[key],`${key} meals claimed`);}
 const selected=Object.keys(d.components||{}).filter(k=>d.components[k]?.selected);
 if(selected.length!==2||selected.some(k=>!COMPONENTS[k]))add(1,'Select two of the four snack components.');
 for(const key of selected)for(const part of ['food','portion','prepared'])if(!d.components[key]?.[part]?.trim())add(1,`Complete the food, serving size and total prepared for ${COMPONENTS[key]||key}.`);
 if(d.answers?.['17']==='Yes'&&!d.training?.trim())add(3,'Describe how and when training will be provided.');
}
