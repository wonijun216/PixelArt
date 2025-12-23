import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, doc, setDoc, onSnapshot, serverTimestamp, deleteDoc, getDocs, updateDoc, getDoc, addDoc, query, orderBy, limit, startAfter } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyBjTIvP-E9KfZXFzuNE4sF9DmGzD4XkvEE",
    authDomain: "pixelart-e899e.firebaseapp.com",
    projectId: "pixelart-e899e",
    storageBucket: "pixelart-e899e.firebasestorage.app",
    messagingSenderId: "636347114408",
    appId: "1:636347114408:web:287e0ab9e7090f809a739d",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const BOARD_SIZE = 64;
const PAGE_SIZE = 10;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nicknameEl = document.getElementById('nickname');
const colorEl = document.getElementById('picker');
const boardNameEl = document.getElementById('boardName');
const shareBtn = document.getElementById('shareBtn');
const eraseBtn = document.getElementById('eraseBtn');
const logoutBtn = document.getElementById('logoutBtn');
const contributorsList = document.getElementById('contributorsList');
const $y = document.getElementById('y');
$y.textContent = new Date().getFullYear();

const authControls = document.getElementById('authControls');
const galleryControls = document.getElementById('galleryControls');
const boardControls = document.getElementById('boardControls');
const boardView = document.getElementById('boardView');
const gallery = document.getElementById('gallery');
const pagination = document.getElementById('pagination');
const newArtworkBtn = document.getElementById('newArtworkBtn');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const artworkTitle = document.getElementById('artworkTitle');
const likeBtn = document.getElementById('likeBtn');
const likeCountEl = document.getElementById('likeCount');
const backToGallery = document.getElementById('backToGallery');

const params = new URLSearchParams(location.search);
let currentBoardId = params.get('board') || null;
let currentUser = null;
let isAdmin = false;
const adminEmail = "jjunking100@naver.com";
let eraseMode = false;
let cells = new Map();
let lastVisible = null;
let currentPage = 1;
let totalPages = 1;
let currentSort = 'popular';
let searchQuery = '';

onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) {
        isAdmin = (user.email === adminEmail);
        authControls.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        if (!currentBoardId) {
            galleryControls.classList.remove('hidden');
            loadGallery();
        } else {
            loadBoard(currentBoardId);
        }
    } else {
        authControls.classList.remove('hidden');
        galleryControls.classList.add('hidden');
        boardView.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
});

// 로그인 / 회원가입 / 로그아웃
document.getElementById('signupBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) {
        alert("이메일과 비밀번호를 입력하세요.");
        return;
    }
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("회원가입 성공");
    } catch (e) {
        alert("회원가입 실패: " + e.message);
    }
});

document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) {
        alert("이메일과 비밀번호를 입력하세요.");
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
        alert("로그인 실패: " + e.message);
    }
});

logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
});

// 갤러리 로드
async function loadGallery() {
    gallery.innerHTML = '';
    pagination.innerHTML = '';
    boardView.classList.add('hidden');
    galleryControls.classList.remove('hidden');

    let q = query(collection(db, 'boards'), limit(PAGE_SIZE));
    if (currentSort === 'popular') {
        q = query(collection(db, 'boards'), orderBy('likes', 'desc'), limit(PAGE_SIZE));
    } else {
        q = query(collection(db, 'boards'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    }
    if (lastVisible) {
        q = query(q, startAfter(lastVisible));
    }
    // 검색은 클라이언트 측 필터링으로 간단히 (Firestore 인덱스 필요 시 확장)
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
        const data = docSnap.data();
        if (searchQuery && !data.title.toLowerCase().includes(searchQuery.toLowerCase())) return;
        const item = document.createElement('div');
        item.classList.add('galleryItem');
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 200;
        thumbCanvas.height = 200;
        renderThumbnail(thumbCanvas, data.cells || []);
        item.appendChild(thumbCanvas);
        const titleEl = document.createElement('div');
        titleEl.classList.add('title');
        titleEl.textContent = data.title || '무제';
        item.appendChild(titleEl);
        const likesEl = document.createElement('div');
        likesEl.classList.add('likes');
        likesEl.textContent = `❤️ ${data.likes || 0}`;
        item.appendChild(likesEl);
        item.addEventListener('click', () => {
            location.href = `?board=${docSnap.id}`;
        });
        gallery.appendChild(item);
    });
    lastVisible = snap.docs[snap.docs.length - 1];
    // 페이지네이션은 간단히 (총 개수 계산 생략, 무한 스크롤 대안 가능)
}

// 썸네일 렌더 (cells 데이터로)
function renderThumbnail(cnv, cellData) {
    const tctx = cnv.getContext('2d');
    const cellSize = cnv.width / BOARD_SIZE;
    tctx.clearRect(0, 0, cnv.width, cnv.height);
    cellData.forEach(cell => {
        tctx.fillStyle = cell.color;
        tctx.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
    });
}

// 보드 로드
async function loadBoard(boardId) {
    galleryControls.classList.add('hidden');
    boardView.classList.remove('hidden');
    boardNameEl.textContent = boardId;
    artworkTitle.classList.remove('hidden');
    const boardDoc = doc(db, 'boards', boardId);
    const boardSnap = await getDoc(boardDoc);
    if (boardSnap.exists()) {
        artworkTitle.value = boardSnap.data().title || '';
    }

    const cellsCol = collection(db, 'boards', boardId, 'cells');
    onSnapshot(cellsCol, snap => {
        cells.clear();
        const nickSet = new Set();
        snap.forEach(d => {
            const data = d.data();
            if (typeof data.x === 'number' && typeof data.y === 'number' && typeof data.color === 'string') {
                cells.set(`${data.x}_${data.y}`, data);
                if (data.nickname) nickSet.add(data.nickname);
            }
        });
        renderAll();
        const sorted = Array.from(nickSet).sort((a, b) => a.localeCompare(b, 'ko'));
        contributorsList.innerHTML = sorted.length ? sorted.map(n => `<span>${n}</span>`).join('') : '<span class="muted">(없음)</span>';
    });

    // 좋아요 로드
    const likesCol = collection(db, 'boards', boardId, 'likes');
    onSnapshot(likesCol, snap => {
        likeCountEl.textContent = snap.size;
        const userLike = Array.from(snap.docs).find(d => d.id === currentUser.uid);
        likeBtn.textContent = userLike ? '❤️ 좋아요 취소' : '❤️ 좋아요';
    });
}

// 그리드 그리기 등 (기존 함수 유지)
function drawGrid() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    const cell = w / BOARD_SIZE;
    ctx.beginPath();
    for (let i = 0; i <= BOARD_SIZE; i++) {
        const p = Math.round(i * cell) + 0.5;
        ctx.moveTo(p, 0);
        ctx.lineTo(p, h);
        ctx.moveTo(0, p);
        ctx.lineTo(w, p);
    }
    ctx.stroke();
}

function redrawCells() {
    const w = canvas.width, cell = w / BOARD_SIZE;
    for (const [key, data] of cells.entries()) {
        ctx.fillStyle = data.color;
        const [x, y] = key.split('_').map(Number);
        ctx.fillRect(x * cell + 1, y * cell + 1, cell - 1, cell - 1);
    }
}

function renderAll() {
    drawGrid();
    redrawCells();
}

// 셀 좌표 계산 등 (기존 함수 유지)
function getCellFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = (evt.touches ? evt.touches[0].clientX : evt.clientX);
    const clientY = (evt.touches ? evt.touches[0].clientY : evt.clientY);
    const x = Math.floor(((clientX - rect.left) * scaleX) / (canvas.width / BOARD_SIZE));
    const y = Math.floor(((clientY - rect.top) * scaleY) / (canvas.height / BOARD_SIZE));
    return { x, y };
}

async function paintCell(x, y) {
    const nick = nicknameEl.value.trim();
    if (!nick) {
        alert('닉네임을 입력하세요');
        return;
    }
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return;
    const id = `${x}_${y}`;
    const ref = doc(db, 'boards', currentBoardId, 'cells', id);
    if (eraseMode) {
        const cellData = cells.get(id);
        if (!cellData) return;
        if (cellData.uid !== currentUser.uid && !isAdmin) {
            alert("자신의 타일만 삭제 할 수 있습니다");
            return;
        }
        await deleteDoc(ref);
        return;
    }
    await setDoc(ref, { x, y, color: colorEl.value, nickname: nick, uid: currentUser.uid, updatedAt: serverTimestamp() });
}

eraseBtn.addEventListener('click', () => {
    eraseMode = !eraseMode;
    eraseBtn.classList.toggle('eraseMode', eraseMode);
    eraseBtn.textContent = eraseMode ? '지우개 ON' : '지우개';
});

let isDrawing = false;
canvas.addEventListener('mousedown', e => { isDrawing = true; const { x, y } = getCellFromEvent(e); paintCell(x, y); });
canvas.addEventListener('mousemove', e => { if (!isDrawing) return; const { x, y } = getCellFromEvent(e); paintCell(x, y); });
canvas.addEventListener('mouseup', () => { isDrawing = false; });
canvas.addEventListener('mouseleave', () => { isDrawing = false; });
canvas.addEventListener('touchstart', e => { isDrawing = true; const { x, y } = getCellFromEvent(e); paintCell(x, y); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', e => { if (!isDrawing) return; const { x, y } = getCellFromEvent(e); paintCell(x, y); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchend', () => { isDrawing = false; }, { passive: false });

// 새 작품 만들기
newArtworkBtn.addEventListener('click', async () => {
    const title = prompt('작품 제목을 입력하세요:');
    if (!title) return;
    const newBoardRef = await addDoc(collection(db, 'boards'), {
        title,
        likes: 0,
        createdAt: serverTimestamp()
    });
    location.href = `?board=${newBoardRef.id}`;
});

// 검색 및 정렬
searchInput.addEventListener('input', e => {
    searchQuery = e.target.value;
    loadGallery();
});
sortSelect.addEventListener('change', e => {
    currentSort = e.target.value;
    loadGallery();
});

// 공유
shareBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(location.origin + location.pathname + `?board=${encodeURIComponent(currentBoardId)}`);
        shareBtn.textContent = '복사되었습니다';
        setTimeout(() => shareBtn.textContent = '링크 복사', 1000);
    } catch (e) {
        alert('복사 실패');
    }
});

// 좋아요
likeBtn.addEventListener('click', async () => {
    const likeRef = doc(db, 'boards', currentBoardId, 'likes', currentUser.uid);
    const likeSnap = await getDoc(likeRef);
    if (likeSnap.exists()) {
        await deleteDoc(likeRef);
    } else {
        await setDoc(likeRef, { likedAt: serverTimestamp() });
    }
    // likes 카운트 업데이트는 onSnapshot으로 처리
});

// 제목 업데이트
artworkTitle.addEventListener('change', async () => {
    await updateDoc(doc(db, 'boards', currentBoardId), { title: artworkTitle.value });
});

// 갤러리로 돌아가기
backToGallery.addEventListener('click', () => {
    location.href = location.origin + location.pathname;
});

// 닉네임 변경 (기존)
let previousNickname = "";
nicknameEl.addEventListener("change", async () => {
    const newNick = nicknameEl.value.trim();
    if (!previousNickname) {
        previousNickname = newNick;
        return;
    }
    if (newNick && newNick !== previousNickname) {
        const ok = confirm(`닉네임을 '${previousNickname}'에서 '${newNick}'(으)로 변경하시겠습니까?`);
        if (!ok) {
            nicknameEl.value = previousNickname;
            return;
        }
        const q = await getDocs(collection(db, 'boards', currentBoardId, 'cells'));
        for (const d of q.docs) {
            const data = d.data();
            if (data.uid === currentUser.uid && data.nickname === previousNickname) {
                await updateDoc(d.ref, { nickname: newNick });
            }
        }
        previousNickname = newNick;
    }
});

if (!currentBoardId) {
    loadGallery();
} else if (currentUser) {
    loadBoard(currentBoardId);
}
