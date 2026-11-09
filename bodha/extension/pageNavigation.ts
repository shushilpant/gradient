/** Match only observed local coursework destinations; ignore harmless fragments/slashes. */
export function courseworkDestination(value:string,current:string,observed:string[]):string|undefined {
  try {
    const base=new URL(current);const target=new URL(value,base);
    const normalize=(url:URL)=>{url.hash='';url.pathname=url.pathname.replace(/\/+$/,'')||'/';return url.href;};
    if(target.origin!==base.origin||target.username||target.password)return;
    const path=decodeURIComponent(target.pathname);
    if(!/^\/courses(?:\/\d+(?:\/(?:assignments|pages|modules)(?:\/[^?#]*)?)?)?\/?$/.test(path)||/\/(?:quizzes|assessments|submissions|edit|delete|logout|settings|external_tools|take|\.\.)(?:\/|$)/i.test(path))return;
    if([...target.searchParams.keys()].some(key=>!['page','per_page','search_term','view'].includes(key)))return;
    const key=normalize(target);if(key===normalize(base))return;
    return observed.find(href=>{try{return normalize(new URL(href,current))===key;}catch{return false;}});
  }catch{return;}
}
