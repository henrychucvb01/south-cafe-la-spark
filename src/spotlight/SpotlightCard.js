import React from 'react';
import {REACTIONS} from './service';
import './spotlight.css';
export default function SpotlightCard({post,onReact,busy=false}){
 return <article className="spotlight-card">
  <div className="spotlight-ribbon"><span>✦ SPARK SPOTLIGHT</span><span className="spotlight-category">{post.category}</span></div>
  <h3>{post.headline}</h3>
  {post.photo_url&&<img className="spotlight-photo" src={post.photo_url} alt={post.headline} loading="lazy"/>}
  <p className="spotlight-body">{post.body}</p>
  {post.published_at&&<time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'})}</time>}
  <div className="spotlight-reactions" aria-label="Manager reactions">{REACTIONS.map(([key,icon,label])=>onReact?<button type="button" key={key} disabled={busy} aria-pressed={post.mine===key} onClick={()=>onReact(post,key)}><span>{icon}</span> {label} <strong>{post.counts?.[key]||0}</strong></button>:<span key={key}>{icon} {label} <strong>{post.counts?.[key]||0}</strong></span>)}</div>
  {!!post.reactors?.length&&<details className="spotlight-reaction-details">
   <summary>See who reacted ({post.reactors.length})</summary>
   <ul>{post.reactors.map(person=>{const reaction=REACTIONS.find(([key])=>key===person.reaction);return <li key={person.location_id}>
    <span className="spotlight-reaction-icon" role="img" aria-label={reaction?.[2]||person.reaction}>{reaction?.[1]}</span>
    <span><strong>{person.name||'Name not recorded'}</strong><small>{person.school_name||'School not recorded'}</small></span>
   </li>;})}</ul>
  </details>}
 </article>;
}
