import {it,expect} from 'vitest';
import {courseworkDestination as destination} from '../extension/pageNavigation.js';
const root='http://127.0.0.1:8080';
it('accepts observed module links and normalized slash/fragment variants',()=>{
 expect(destination('/courses/1/modules/items/9#content',root+'/',[root+'/courses/1/modules/items/9/'])).toBe(root+'/courses/1/modules/items/9/');
 expect(destination('/courses/1?view=feed',root+'/',[root+'/courses/1?view=feed'])).toBe(root+'/courses/1?view=feed');
});
it('skips self links and rejects unobserved or restricted destinations',()=>{
 for(const path of ['/courses/1','/courses/2','/courses/1/assignments/2/edit','/courses/1/external_tools/1','/courses/1?delete=1'])expect(destination(path,root+'/courses/1',[root+'/courses/1',root+'/courses/1/assignments/2/edit',root+'/courses/1?delete=1'])).toBeUndefined();
 expect(destination('https://example.com/courses/1',root+'/', ['https://example.com/courses/1'])).toBeUndefined();
});
