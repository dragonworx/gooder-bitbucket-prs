const state = {
  hasInit: false,
  files: [],
  activeHeader: null,
  data: {
    reviewed: {}
  },
  tree: {}
};

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

const storageKey = 'bitbucket-pr-goodness-ext:' + hashCode(location.pathname);

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
        cssClass = state.data.reviewed[file.filename] ? 'reviewed' : 'un-reviewed';
        const filename = file.filename.split('/').pop();
        div.innerHTML = `<img class="file" src="${chrome.extension.getURL(`file-${file.lozenge}.png`)}" /> <a id="tree-file-${file.filename}" data-id="${file.filename}" class="${cssClass}" title="[${changeType}] ${file.filename}" href="${file.href}">${filename}</a>`;
        li.appendChild(div);
      });
    }
    if (key !== '$') {
      li.innerHTML = `<div class="row"><img class="folder" src="${chrome.extension.getURL('folder.png')}" /> ${key}</div>`;
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
    const contentElement = headingElement.nextElementSibling;
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
    const filepathPrefix = filepath.slice(0, -1).join('/');
    const html = fileElement.innerHTML.replace(filename, `<input type="checkbox" ${state.data.reviewed[filename] ? 'checked' : ''}/> ${filepathPrefix}/<b>${filepathName}</b>`);
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

    const regex = /^[+\-]/g;

    contentElement.querySelectorAll('pre').forEach(pre => {
      let id;

      const process = () => {
        const html = pre.innerHTML;
        if (html.match(regex)) {
          pre.innerHTML = pre.innerHTML.replace(regex, '');
          setTimeout(() => clearInterval(id), 1000);
        }
      };

      id = setInterval(process, 30);
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
        // update tree item
        const el = document.getElementById(`tree-file-${filename}`);
        el.classList.remove('reviewed');
        el.classList.remove('un-reviewed');
        if (isChecked) {
          el.classList.add('reviewed');
        } else {
          el.classList.add('un-reviewed');
        }
        return;
      }
      const isCollapsed = !file.isCollapsed;
      const files = [];
      if (e.shiftKey) {
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
    headingElement.style.background = 'linear-gradient(0deg, #ceffd7 0, #ffffff 100%)';
    if (changeType === 'deleted') {
      diffContainer.classList.add('collapsed');
      file.isCollapsed = true;
      headingElement.style.background = 'linear-gradient(0deg, rgb(255, 223, 224) 0px, rgb(255, 255, 255) 100%)';
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
};

// trap global keys
window.addEventListener('keydown', e => {
  const key = e.keyCode;
  switch (key) {
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

// wait for content
detectChangeSetContent();