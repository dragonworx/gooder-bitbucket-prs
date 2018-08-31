const state = {
  hasInit: false,
  files: [],
  activeHeader: null,
  data: {
    reviewed: {}
  },
  tree: {},
  treeItems: [],
  actions: {},
  options: {
    hideComments: false,
    hideDeletions: false,
  },
};

const autoCollapsePattern = /\.lock|-lock/;

function getURL (url) {
  return `https://raw.githubusercontent.com/dragonworx/gooder-bitbucket-prs/master/${url}`;
}

function getFile (filename) {
  for (let i = 0; i < state.files.length; i++) {
    if (state.files[i].filename === filename) {
      return state.files[i];
    }
  }
}

function hashCode (str) {
  var hash = 0, i, chr;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i++) {
    chr   = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function updateTreeItems () {
  state.treeItems.forEach(div => {
    const isChecked = state.data.reviewed[div.file.filename];
    div.classList.remove('reviewed');
    div.classList.remove('un-reviewed');
    if (isChecked) {
      div.classList.add('reviewed');
    } else {
      div.classList.add('un-reviewed');
    }
  });
}

const storageKey = 'gooder-bitbucket-prs:' + hashCode(location.pathname);

function load () {
  try {
    state.data = JSON.parse(localStorage[storageKey]);
  } catch (e) {

  }
}

function save () {
  try {
    localStorage[storageKey] = JSON.stringify(state.data);
  } catch (e) {

  }
}

function detectChangeSetContent () {
  const container = document.getElementById('changeset-diff');
  if (container) {
    if (!state.hasInit) {
      init(container);
    }
  } else {
    state.hasInit = false;
  }
  setTimeout(detectChangeSetContent, 30);
}

function waitFor (selector, parentNode = document.body) {
  return new Promise((resolve) => {
    const check = () => {
      const element = parentNode.querySelector(selector);
      if (element) {
        resolve(element);
      } else {
        setTimeout(check, 30);
      }
    };
    check();
  });
}

function init (container) {
  load();
  initFileTree(container);
  initFileDiffs(container);

  // update init flag
  state.hasInit = true;
}

function create (nodeName, cssClasses = [], attribs = {}) {
  const el = document.createElement(nodeName);
  cssClasses.forEach(clsName => el.classList.add(clsName));
  for (let key in attribs) {
    el.setAttribute(key, attribs[key]);
  }
  return el;
}

/**
 * Convert List to Tree
 */
function initFileTree (container) {
  const files = [];
  const ul = document.getElementById('commit-files-summary');
  const items = ul.querySelectorAll('li');

  // register each file
  items.forEach(li => {
    const filename = li.querySelector('a').textContent.trim();
    const lozenge = li.querySelector('.diff-summary-lozenge').textContent.trim();
    const href = li.querySelector('a').getAttribute('href');
    const file = {
      filename: filename,
      lozenge: lozenge,
      href: href,
    };
    files.push(file);
    registerTreeItem(file);
  });
  
  // build new tree
  const root = create('ul', ['tree'], { id: 'tree'});
  buildTreeNode(state.tree, root);
  ul.parentElement.replaceChild(root, ul);

  initActions(root);
  updateTreeItems();
}

function initActions (root) {
  // add global options
  const html = `
    <label><input type="checkbox" data-action="hide-comments" /> Hide Comments</label>
    <label><input type="checkbox" data-action="hide-deletions" /> Hide Deletions</label>
  `;
  const div = create('div', ['options']);
  div.innerHTML = html;
  root.appendChild(div);

  const hideComments = div.querySelector('*[data-action="hide-comments"]');
  const hideDeletions = div.querySelector('*[data-action="hide-deletions"]');
  state.actions = {
    hideComments,
    hideDeletions,
  };

  hideComments.addEventListener('change', () => {
    state.options.hideComments = !state.options.hideComments;
    applyOptions();
  });

  hideDeletions.addEventListener('change', () => {
    state.options.hideDeletions = !state.options.hideDeletions;
    applyOptions();
  });
}

function applyOptions () {
  // hide comments
  const hideComments = state.options.hideComments;
  const hideDeletions = state.options.hideDeletions;

  document.querySelectorAll('.comment-thread-container').forEach(el => el.style.display = hideComments ? 'none' : '');
  document.querySelectorAll('.udiff-line.deletion').forEach(el => el.style.display = hideDeletions ? 'none' : '');

  state.files.forEach(file => {
    if (file.type === 'deleted') {
      file.diffContainer.style.display = hideDeletions ? 'none' : '';
    }
  });

  state.treeItems.forEach(div => {
    const file = div.file;
    if (file.lozenge === 'D') {
      div.style.display = hideDeletions ? 'none' : '';
    }
  });
}

function registerTreeItem (file) {
  const paths = file.filename.split('/');
  let node = state.tree;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (i === paths.length - 1) {
      // leaf
      if (!node.$) {
        node.$ = [];
      }
      node.$.push(file);
    } else {
      // branch
      if (!node[path]) {
        node[path] = {};
      }
      node = node[path];
    }
  }
}

const changeTypes = {
  M: 'MODIFIED',
  R: 'RENAMED',
  A: 'ADDED',
  D: 'DELETED',
};

function buildTreeNode (dataNode, domNode) {
  for (let key in dataNode) {
    // folder
    const li = create('li', ['branch']);
    domNode.appendChild(li);
    if (dataNode.$) {
      dataNode.$.forEach(file => {
        // file
        const changeType = changeTypes[file.lozenge];
        const div = create('div', ['row']);
        const filename = file.filename.split('/').pop();
        div.innerHTML = `<img class="file" src="${getURL(`file-${file.lozenge}.png`)}" /> <a id="tree-file-${file.filename}" data-id="${file.filename}" title="[${changeType}] ${file.filename}" href="${file.href}">${filename}</a>`;
        li.appendChild(div);
        state.treeItems.push(div);
        div.file = file;
      });
    }
    if (key !== '$') {
      li.innerHTML = `<div class="row"><img class="folder" src="${getURL('folder.png')}" /> ${key}</div>`;
      buildTreeNode(dataNode[key], li);
    }
  }
}

/**
 * Initialise File Diffs
 */
function initFileDiffs (container) {
   // get the files
   state.files = [];
   const diffElement = container.querySelectorAll('.diff-container');
   diffElement.forEach(diffElement => {
    const headingElement = diffElement.querySelector('.heading');
    const fileElement = diffElement.querySelector('.filename');
    const filename = fileElement.childNodes[2].textContent.trim();
    const changeType = fileElement.childNodes[3].textContent.trim().toLowerCase();
    const contentElement = headingElement.parentElement.lastElementChild;
    const diffContainer = diffElement.parentElement;
    const file = {
      type: changeType,
      path: filename,
      fileElement: fileElement,
      headingElement: headingElement,
      contentElement: contentElement,
      diffContainer: diffContainer,
      isCollapsed: false,
      href: diffContainer.getAttribute('id')
    };
    state.files.push(file);

    // style
    headingElement.classList.add('file-heading');
    headingElement.classList.add(`type-${changeType}`);

    // highlight filename
    const filepath = filename.split('/');
    const filepathName = filepath.pop();
    const filepathPrefix = filepath.join('/');
    const html = fileElement.innerHTML.replace(filename, `<input type="checkbox" ${state.data.reviewed[filename] ? 'checked' : ''}/> ${filepathPrefix}${filepath.length ? '/' : ''}<b>${filepathName}</b>`);
    fileElement.innerHTML = html;

    // track actions
    headingElement.addEventListener('mousedown', e => {
      const target = e.target;
      if (target.classList.contains('add-file-comment')) {
        waitFor('.new-comment', headingElement.parentElement)
          .then(() => {
            if (file.isCollapsed) {
              file.isCollapsed = false;
              diffContainer.classList.remove('collapsed');
            }
            headingElement.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' });
          });
      }
    });

    const insDelRegex = /^[+\-]/g;
    const conflictDestRegex = /^&nbsp;&lt;&lt;&lt;&lt;&lt;&lt;&lt;/g;
    const conflictSourceRegex = /^&nbsp;&gt;&gt;&gt;&gt;&gt;&gt;&gt;/g;
    const conflictSepRegex = /^&nbsp;=======/g;
    const shaRegex = /(destination|source):([a-f0-9]+):(.*)/i;

    contentElement.querySelectorAll('pre').forEach(pre => {
      let id;

      const removeInsDelChars = (cancel = () => {}) => {
        const html = pre.innerHTML.trim();
        if (html.match(insDelRegex)) {
          pre.innerHTML = pre.innerHTML.replace(insDelRegex, '&nbsp;');
          cancel();
        } else if (html.match(conflictDestRegex)) {
          let subHTML = html.replace(conflictDestRegex, '');
          const match = subHTML.match(shaRegex);
          if (match) {
            subHTML = ` ${match[1]}: ${match[2].substr(0, 6)}: <b>${match[3]}</b>`;
          }
          pre.innerHTML = subHTML;
          pre.style.color = '#ff8600';
          cancel();
        } else if (html.match(conflictSourceRegex)) {
          let subHTML = html.replace(conflictSourceRegex, '');
          const match = subHTML.match(shaRegex);
          if (match) {
            subHTML = ` ${match[1]}: ${match[2].substr(0, 6)}: <b>${match[3]}</b>`;
          }
          pre.innerHTML = subHTML;
          pre.style.color = '#ff8600';
          cancel();
        } else if (html.match(conflictSepRegex)) {
          pre.innerHTML = pre.innerHTML.replace(conflictSepRegex, '');
          pre.style.height = '3px';
          cancel();
        }
      };

      const processViaMutationObserver = () => {
        removeInsDelChars();
        const observer = new MutationObserver(mutationsList => {
          mutationsList.forEach(mutation => {
            if (mutation.type === 'childList') {
              removeInsDelChars();
            }
          })
        });

        observer.observe(pre, {
          childList: true,
        });

        setTimeout(() => {
          observer.disconnect();
        }, 15000);
      };

      if (typeof MutationObserver !== 'undefined') {
        // use mutation observer
        processViaMutationObserver();
      } else {
        // poll
        id = setInterval(() => removeInsDelChars(() => {
          setTimeout(() => clearInterval(id), 10000);
        }), 100);
      }
    });

    // toggle collapse on click
    fileElement.addEventListener('click', e => {
      if (e.target.nodeName === 'INPUT') {
        // skip when clicking done checkbox
        const isChecked = e.target.checked;
        state.data.reviewed[filename] = isChecked;
        if (!isChecked) {
          delete state.data.reviewed[filename];
        }
        save();
        if (isChecked && !file.isCollapsed) {
          diffContainer.classList.add('collapsed');
          file.isCollapsed = true;
          scrollToTree();
        }
        // update tree item - if option pressed updated all items with current item state
        if (e.altKey) {
          state.treeItems.forEach(div => {
            state.data.reviewed[div.file.filename] = isChecked;
            const file = getFile(div.file.filename);
            file.fileElement.querySelector('input[type="checkbox"]').checked = isChecked;
            if (isChecked && !file.isCollapsed) {
              file.diffContainer.classList.add('collapsed');
              file.isCollapsed = true;
            }
          });
        }
        updateTreeItems();
        document.getElementById('tree').scrollIntoView();
        return;
      }
      const isCollapsed = !file.isCollapsed;
      const files = [];
      if (e.shiftKey || e.altKey) {
        files.push.apply(files, state.files);
      } else {
        files.push(file);
      }
      files.forEach(file => {
        if (isCollapsed) {
          file.diffContainer.classList.add('collapsed');
        } else {
          file.diffContainer.classList.remove('collapsed');
        }
        file.isCollapsed = isCollapsed;
      });
    });

    // hide deleted by default
    let bgColor = 'linear-gradient(0deg, #ceffd7 0, #ffffff 100%)';
    
    if (changeType === 'deleted') {
      diffContainer.classList.add('collapsed');
      file.isCollapsed = true;
      bgColor = 'linear-gradient(0deg, rgb(255, 223, 224) 0px, rgb(255, 255, 255) 100%)';
    } else if (changeType === 'added') {
      // bgColor = 'linear-gradient(0deg, rgb(206, 246, 255) 0px, rgb(255, 255, 255) 100%)';
    }

    headingElement.style.background = bgColor;

    // collapse if reviewed, or if known large file type
    const shouldAutoLock = !!filename.match(autoCollapsePattern);
    if (state.data.reviewed[filename] || shouldAutoLock) {
      file.isCollapsed = true;
      diffContainer.classList.add('collapsed');
    }
   });
}

function styleActiveHeader (headingElement) {
  if (headingElement.hasActiveStyle) {
    return;
  }
  headingElement.style.borderBottom = '1px solid #e2e2e2';
  state.activeHeader = headingElement;
  headingElement.hasActiveStyle = true;
}

function unstyleActiveHeader (headingElement) {
  if (headingElement.hasActiveStyle) {
    headingElement.style.borderBottom = '0';
    headingElement.hasActiveStyle = false;
  }
}

// register scroll handler
window.addEventListener('scroll', e => {
  if (!state.hasInit) {
    return;
  }
  for (let i = 0; i < state.files.length; i++) {
    const file = state.files[i];
    if (file.isCollapsed) {
      continue;
    }
    const headingElement = file.headingElement;
    const bounds = headingElement.getBoundingClientRect();
    if (bounds.top === 0) {
      if (state.activeHeader) {
        unstyleActiveHeader(state.activeHeader);
      }
      styleActiveHeader(headingElement);
    } else {
      unstyleActiveHeader(headingElement);
    }
  }
});

function getFile (filename) {
  for (let i = 0; i < state.files.length; i++) {
    if (state.files[i].path === filename) {
      return state.files[i];
    }
  }
}

function goToNextUnreviewd () {
  // turn off the options
  state.options.hideComments = false;
  state.options.hideDeletions = false;
  state.actions.hideComments.checked = false;
  state.actions.hideDeletions.checked = false;
  applyOptions();
  
  const items = document.querySelectorAll('#tree a');
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.classList.contains('un-reviewed')) {
      const filename = a.getAttribute('data-id');
      const file = getFile(filename);
      location.hash = file.href;
      if (file.isCollapsed) {
        file.diffContainer.classList.remove('collapsed');
        file.isCollapsed = false;
        file.diffContainer.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
  }
}

function scrollToTree () {
  const el = document.querySelector('#pullrequest-diff, #commit-summary');
  if (el) {
    el.scrollIntoView();
  }
}

const keys = {
  ENTER: 13,
  ESC: 27,
  SPACE: 32,
  HOME: 36,
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  PAGE_UP: 33,
  PAGE_DOWN: 34,
  BACK_SLASH: 220,
  FORWARD_SLASH: 191,
};

// trap global keys
window.addEventListener('keydown', e => {
  const key = e.keyCode;
  // console.log(key);
  switch (key) {
    case keys.FORWARD_SLASH:
    case keys.HOME:
      if (!e.metaKey) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      scrollToTree();
      break;
    case keys.ENTER:
      if (!e.metaKey) {
        return;
      }
      goToNextUnreviewd();
      break;
  }
});

try {
  // wait for content
  detectChangeSetContent();
} catch (e) {
  console.log("Error loading: " + e.stack);
}