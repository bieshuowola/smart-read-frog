// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { inferElementBlockRole } from "../element-context"

describe("inferElementBlockRole", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("identifies author/username containers via semantic attrs, profile hrefs, overlay links, and generic tokens", () => {
    document.body.innerHTML = `
      <a id="rel-author" rel="author" href="/members/alex">AlexDev</a>
      <a id="profile-link" href="https://example.com/id/Kasodus">Kasodus</a>
      <div class="friendBlock" id="overlay-card">
        <a class="friendBlockLinkOverlay" href="https://example.com/profiles/76561197984862442"></a>
        <div class="friendBlockContent" id="overlay-author">Sarg Bjornson</div>
      </div>
      <div class="workshopItemAuthorName" id="author-wrap"><a href="https://example.com/users/ed">legodude17</a></div>
      <div class="forum_topic_op" id="topic-op">Sarg Bjornson</div>
    `

    expect(inferElementBlockRole([document.getElementById("rel-author")!])).toBe("author")
    expect(inferElementBlockRole([document.getElementById("profile-link")!])).toBe("author")
    expect(inferElementBlockRole([document.getElementById("overlay-author")!])).toBe("author")
    expect(inferElementBlockRole([document.getElementById("author-wrap")!])).toBe("author")
    expect(inferElementBlockRole([document.getElementById("topic-op")!])).toBe("author")
  })

  it("prioritizes author links inside comment blocks while marking comment body as comment", () => {
    document.body.innerHTML = `
      <div class="commentthread_comment">
        <a id="commenter" class="commentthread_author_link" href="/id/user42">Player42</a>
        <div id="comment-body" class="commentthread_comment_text">Nice</div>
      </div>
      <blockquote id="bq">Great release!</blockquote>
    `

    expect(inferElementBlockRole([document.getElementById("commenter")!])).toBe("author")
    expect(inferElementBlockRole([document.getElementById("comment-body")!])).toBe("comment")
    expect(inferElementBlockRole([document.getElementById("bq")!])).toBe("comment")
  })

  it("identifies headings, item titles, and sidebar/filter categories without matching code or header nav", () => {
    document.body.innerHTML = `
      <header><div class="header-title" id="nav-brand">Site Brand</div></header>
      <main>
        <h1 id="h1-title">Main Article</h1>
        <div class="workshopItemTitle" id="item-title">Trailer Styled Zombat</div>
        <aside>
          <label id="cat-label"><input type="checkbox" /> Models</label>
          <div class="browseOption" id="cat-opt"><a href="?tag=maps">Maps</a></div>
        </aside>
        <pre><code class="title" id="code-title">const title = 1;</code></pre>
      </main>
    `

    expect(inferElementBlockRole([document.getElementById("h1-title")!])).toBe("heading")
    expect(inferElementBlockRole([document.getElementById("item-title")!])).toBe("heading")
    expect(inferElementBlockRole([document.getElementById("cat-label")!])).toBe("category")
    expect(inferElementBlockRole([document.getElementById("cat-opt")!])).toBe("category")
    expect(inferElementBlockRole([document.getElementById("nav-brand")!])).toBe("generic")
    expect(inferElementBlockRole([document.getElementById("code-title")!])).toBe("generic")
  })

  it("identifies explicit button controls while ignoring pure links", () => {
    document.body.innerHTML = `
      <header>
        <button id="btn-sub">Subscribe</button>
        <div id="role-btn" role="button"><span>Load More</span></div>
        <a id="nav-link" href="#browse">Workshop Home</a>
      </header>
    `

    expect(inferElementBlockRole([document.getElementById("btn-sub")!])).toBe("control")
    expect(inferElementBlockRole([document.getElementById("role-btn")!])).toBe("control")
    expect(inferElementBlockRole([document.getElementById("nav-link")!])).toBe("generic")
  })

  it("unwraps single-element wrapper chains when inferring heading roles", () => {
    document.body.innerHTML = `
      <div class="workshopItem">
        <a id="card-anchor" href="#m1"><div class="workshopItemTitle">Clean UI</div></a>
      </div>
    `

    expect(inferElementBlockRole([document.getElementById("card-anchor")!])).toBe("heading")
  })
})
