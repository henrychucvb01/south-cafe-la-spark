import {sideQuestGallery} from '../../lib/sideQuestGallery';
import {pickPhoto,gallerySpace} from './sideGalleryModel';
test('only approved side quests with consent are signed, without exposing private fields',async()=>{
 const entry={id:'ok',quest:1,state:'approved',consent:true,photo_path:'allowed',school_name:'School',quest_name:'Quest',note:'private'};
 const bucket={createSignedUrls:jest.fn().mockResolvedValue({data:[{path:'allowed',signedUrl:'signed'}]})};
 const result=await sideQuestGallery({entries:[entry,{...entry,id:'pending',state:'pending',photo_path:'pending'},{...entry,state:'rejected',photo_path:'rejected'},{...entry,consent:false,photo_path:'private'},{...entry,quest:0,photo_path:'door'}]},bucket);
 expect(bucket.createSignedUrls).toHaveBeenCalledWith(['allowed'],300);expect(result).toEqual({photos:[{id:'ok',url:'signed',school:'School',quest:'Quest'}]});
});
test('empty and inaccessible photos do not appear',async()=>{const bucket={createSignedUrls:jest.fn()};expect(await sideQuestGallery({},bucket)).toEqual({photos:[]});expect(bucket.createSignedUrls).not.toHaveBeenCalled();});
test('random selection excludes both the other frame and previous photo',()=>{const photos=[{id:'a'},{id:'b'},{id:'c'}];expect(pickPhoto(photos,['a','b'],()=>0).id).toBe('c');expect(pickPhoto(photos,['a','b','c'])).toBeNull();expect(pickPhoto(photos,[],()=>.99).id).toBe('c');});
test('galleries only fit outside actual content bounds',()=>{expect(gallerySpace({left:370,right:1550},1920,1080)).toEqual({left:326,right:326,leftOffset:20,rightOffset:20});expect(gallerySpace({left:150,right:1330},1480,900)).toBeNull();expect(gallerySpace({left:100,right:1700},1800,900)).toBeNull();expect(gallerySpace({left:370,right:1550},1920,400)).toBeNull();});

test('extra-wide screens keep galleries 24 pixels from content instead of screen edges',()=>{const space=gallerySpace({left:690,right:1870},2560,1080);expect(space.leftOffset+space.left).toBe(666);expect(2560-space.rightOffset-space.right).toBe(1894);expect(space.left).toBe(340);});
