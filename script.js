import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, orderBy, limit, where, serverTimestamp, increment, updateDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
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

// 상수
const BOARD_SIZE = 64;
const ADMIN_EMAIL = "jjunking100@naver.com";

// 전역 상태
let currentUser = null;
let isAdmin = false;
let currentNickname = '';
let currentView = 'auth';
let currentColor = '#3b82f6';
let eraserMode = false;
let isDrawing = false;
let artworks = [];
let currentFilter = 'latest';
let currentArtworkId = null;

// DOM 요소
const authView = document.getElementById('authView');
const galleryView = document.getElementById('galleryView');
const createView = document.getElementById('createView');
const artworkModal = document.getElementById('artworkModal');
const createCanvas = document.getElementById('createCanvas');
const modalCanvas = document.getElementById('modalCanvas');
const ctx = createCanvas.getContext('2d');

// ===================
// 인증 (Auth)
// ===================
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if(user) {
    isAdmin = (user.email === ADMIN_EMAIL);
    
    // 사용자 닉네임 로드
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if(userDoc.exists()) {
      currentNickname = userDoc.data().nickname;
      document.getElementById('userNicknameDisplay').textContent = currentNickname;
      document.getElementById('userNicknameDisplay').classList.remove('hidden');
    }
    
    document.getElementById('logoutBtn').classList.remove('hidden');
    showView('gallery');
  } else {
    currentNickname = '';
    isAdmin = false;
    document.getElementById('userNicknameDisplay').classList.add('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
    showView('auth');
  }
});

// 회원가입
document.getElementById('signupBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  const nickname = document.getElementById('authNickname').value.trim();
  
  if(!email || !password) {
    alert('이메일과 비밀번호를 입력하세요');
    return;
  }
  
  if(!nickname) {
    alert('닉네임을 입력하세요');
    return;
  }
  
  if(nickname.length > 12) {
    alert('닉네임은 12자 이내로 입력해주세요');
    return;
  }
  
  try {
    // 닉네임 중복 체크
    const nicknameQuery = query(collection(db, 'users'), where('nickname', '==', nickname));
    const nicknameSnapshot = await getDocs(nicknameQuery);
    
    if(!nicknameSnapshot.empty) {
      alert('이미 사용 중인 닉네임입니다');
      return;
    }
    
    // 회원가입
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // 사용자 문서 생성
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      nickname,
      email,
      totalPixels: 0,
      createdAt: serverTimestamp()
    });
    
    alert('회원가입 성공!');
  } catch(e) {
    if(e.code === 'auth/email-already-in-use') {
      alert('이미 사용 중인 이메일입니다');
    } else if(e.code === 'auth/weak-password') {
      alert('비밀번호는 최소 6자 이상이어야 합니다');
    } else {
      alert('회원가입 실패: ' + e.message);
    }
  }
});

// 로그인
document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  
  if(!email || !password) {
    alert('이메일과 비밀번호를 입력하세요');
    return;
  }
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch(e) {
    if(e.code === 'auth/invalid-credential') {
      alert('이메일 또는 비밀번호가 잘못되었습니다');
    } else {
      alert('로그인 실패: ' + e.message);
    }
  }
});

// 로그아웃
document.getElementById('logoutBtn').addEventListener('click', async () => {
  if(confirm('로그아웃 하시겠습니까?')) {
    await signOut(auth);
  }
});

// ===================
// 뷰 전환
// ===================
function showView(view) {
  currentView = view;
  authView.classList.add('hidden');
  galleryView.classList.add('hidden');
  createView.classList.add('hidden');
  
  if(view === 'auth') {
    authView.classList.remove('hidden');
  } else if(view === 'gallery') {
    galleryView.classList.remove('hidden');
    loadArtworks();
    loadLeaderboard();
  } else if(view === 'create') {
    createView.classList.remove('hidden');
    initCreateCanvas();
  }
}

// ===================
// 갤러리 로드
// ===================
async function loadArtworks() {
  const artworksRef = collection(db, 'artworks');
  let q;
  
  if(currentFilter === 'latest') {
    q = query(artworksRef, orderBy('createdAt', 'desc'), limit(50));
  } else if(currentFilter === 'oldest') {
    q = query(artworksRef, orderBy('createdAt', 'asc'), limit(50));
  } else if(currentFilter === 'popular') {
    q = query(artworksRef, orderBy('likes', 'desc'), limit(50));
  }
  
  const snapshot = await getDocs(q);
  artworks = [];
  snapshot.forEach(doc => {
    artworks.push({ id: doc.id, ...doc.data() });
  });
  
  renderArtworks();
}

function renderArtworks() {
  const grid = document.getElementById('artworksGrid');
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  
  const filtered = artworks.filter(a => 
    a.title && a.title.toLowerCase().includes(searchTerm)
  );
  
  if(filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><h3>작품이 없습니다</h3><p>첫 작품을 만들어보세요!</p></div>';
    return;
  }
  
  grid.innerHTML = filtered.map(artwork => `
    <div class="artwork-card" data-artwork-id="${artwork.id}">
      <div class="artwork-preview">
        <canvas id="thumb-${artwork.id}"></canvas>
      </div>
      <div class="artwork-info">
        <h3 class="artwork-title">${artwork.title || '제목 없음'}</h3>
        <div class="artwork-meta">
          <span>기여자 ${artwork.contributorCount || 1}명</span>
          <span class="like-count">❤️ ${artwork.likes || 0}</span>
        </div>
      </div>
    </div>
  `).join('');
  
  // 이벤트 리스너 추가
  document.querySelectorAll('.artwork-card').forEach(card => {
    card.addEventListener('click', () => {
      openArtwork(card.dataset.artworkId);
    });
  });
  
  // requestAnimationFrame을 사용하여 DOM이 완전히 준비된 후 렌더링
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      renderThumbnailsSequentially(filtered);
    });
  });
}

// 병렬 렌더링으로 속도 개선
async function renderThumbnailsSequentially(artworksList) {
  const renderPromises = artworksList.map(artwork => renderThumbnail(artwork.id));
  await Promise.all(renderPromises);
}

// 썸네일 렌더링 (크기 조정 추가)
async function renderThumbnail(artworkId) {
  const canvas = document.getElementById(`thumb-${artworkId}`);
  if(!canvas) {
    console.warn('캔버스를 찾을 수 없음:', artworkId);
    return;
  }
  
  const ctx = canvas.getContext('2d');
  
  // 실제 표시될 크기 가져오기
  const displayWidth = canvas.clientWidth || 240;
  const displayHeight = canvas.clientHeight || 240;
  
  // 캔버스 크기를 표시 크기에 맞게 설정 (고해상도 대응)
  const scale = window.devicePixelRatio || 1;
  canvas.width = displayWidth * scale;
  canvas.height = displayHeight * scale;
  
  // 컨텍스트 스케일 조정
  ctx.scale(scale, scale);
  
  // 배경 흰색
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, displayWidth, displayHeight);
  
  try {
    const cellsRef = collection(db, 'artworks', artworkId, 'cells');
    const snapshot = await getDocs(cellsRef);
    
    console.log(`작품 ${artworkId}: ${snapshot.size}개 셀 로드됨`);
    
    if(snapshot.empty) {
      console.warn('셀 데이터가 없음:', artworkId);
      return;
    }
    
    // 표시 크기에 맞게 셀 크기 계산
    const cellSize = displayWidth / BOARD_SIZE;
    
    // 모든 셀을 배열로 변환 후 한번에 렌더링
    const cells = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if(data && data.color && typeof data.x === 'number' && typeof data.y === 'number') {
        cells.push(data);
      }
    });
    
    // 배치 렌더링
    ctx.save();
    cells.forEach(cell => {
      ctx.fillStyle = cell.color;
      ctx.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
    });
    ctx.restore();
    
    console.log(`작품 ${artworkId}: ${cells.length}개 셀 렌더링 완료 (크기: ${displayWidth}x${displayHeight})`);
    
  } catch(e) {
    console.error('썸네일 렌더링 실패:', artworkId, e);
  }
}

// ===================
// 명예의 전당
// ===================
async function loadLeaderboard() {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, orderBy('totalPixels', 'desc'), limit(10));
  const snapshot = await getDocs(q);
  
  const leaderboard = document.getElementById('leaderboard');
  if(snapshot.empty) {
    leaderboard.innerHTML = '<div style="color:#999; font-size:13px;">기록 없음</div>';
    return;
  }
  
  let html = '';
  let rank = 1;
  snapshot.forEach(doc => {
    const data = doc.data();
    html += `
      <div class="leaderboard-item">
        <span class="rank">${rank}.</span>
        <span>${data.nickname || '익명'}</span>
        <span style="float:right; color:#999;">${data.totalPixels || 0}</span>
      </div>
    `;
    rank++;
  });
  leaderboard.innerHTML = html;
}

// ===================
// 작품 만들기
// ===================
document.getElementById('createNewBtn').addEventListener('click', () => {
  showView('create');
});

document.getElementById('cancelCreateBtn').addEventListener('click', () => {
  if(confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) {
    showView('gallery');
  }
});

function initCreateCanvas() {
  currentArtworkId = 'temp_' + Date.now();
  drawGrid(createCanvas);
  document.getElementById('artworkTitle').value = '';
  eraserMode = false;
  updateEraserButton();
}

function drawGrid(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  
  const cellSize = w / BOARD_SIZE;
  ctx.beginPath();
  for(let i = 0; i <= BOARD_SIZE; i++) {
    const p = i * cellSize;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, h);
    ctx.moveTo(0, p);
    ctx.lineTo(w, p);
  }
  ctx.stroke();
}

// ===================
// 색상 선택
// ===================
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
    eraserMode = false;
    updateEraserButton();
  });
});

document.getElementById('customColor').addEventListener('change', (e) => {
  currentColor = e.target.value;
  eraserMode = false;
  document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
  updateEraserButton();
});

document.getElementById('eraserBtn').addEventListener('click', () => {
  eraserMode = !eraserMode;
  updateEraserButton();
  if(eraserMode) {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
  }
});

function updateEraserButton() {
  const btn = document.getElementById('eraserBtn');
  btn.classList.remove('eraser-on', 'eraser-off');
  btn.classList.add(eraserMode ? 'eraser-on' : 'eraser-off');
}

document.getElementById('clearBtn').addEventListener('click', () => {
  if(confirm('모든 내용을 지우시겠습니까?')) {
    drawGrid(createCanvas);
  }
});

// ===================
// 캔버스 그리기
// ===================
function getCellFromEvent(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const x = Math.floor(((clientX - rect.left) * scaleX) / (canvas.width / BOARD_SIZE));
  const y = Math.floor(((clientY - rect.top) * scaleY) / (canvas.height / BOARD_SIZE));
  return {x, y};
}

function paintCell(canvas, x, y) {
  if(x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return;
  
  const ctx = canvas.getContext('2d');
  const cellSize = canvas.width / BOARD_SIZE;
  
  if(eraserMode) {
    ctx.fillStyle = '#fff';
  } else {
    ctx.fillStyle = currentColor;
  }
  
  ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
  
  // 그리드 다시 그리기
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
}

// 마우스 이벤트
createCanvas.addEventListener('mousedown', e => {
  isDrawing = true;
  const {x, y} = getCellFromEvent(createCanvas, e);
  paintCell(createCanvas, x, y);
});

createCanvas.addEventListener('mousemove', e => {
  if(!isDrawing) return;
  const {x, y} = getCellFromEvent(createCanvas, e);
  paintCell(createCanvas, x, y);
});

createCanvas.addEventListener('mouseup', () => { 
  isDrawing = false; 
});

createCanvas.addEventListener('mouseleave', () => { 
  isDrawing = false; 
});

// 터치 이벤트
createCanvas.addEventListener('touchstart', e => {
  isDrawing = true;
  const {x, y} = getCellFromEvent(createCanvas, e);
  paintCell(createCanvas, x, y);
  e.preventDefault();
}, {passive: false});

createCanvas.addEventListener('touchmove', e => {
  if(!isDrawing) return;
  const {x, y} = getCellFromEvent(createCanvas, e);
  paintCell(createCanvas, x, y);
  e.preventDefault();
}, {passive: false});

createCanvas.addEventListener('touchend', () => { 
  isDrawing = false; 
}, {passive: false});

// ===================
// 게시하기
// ===================
document.getElementById('publishBtn').addEventListener('click', async () => {
  const title = document.getElementById('artworkTitle').value.trim();
 
  if(!title) {
    alert('작품 제목을 입력하세요');
    return;
  }
 
  // ===== 핵심 수정: 캔버스의 실제 drawing buffer 크기 사용 =====
  const canvas = createCanvas;
  const ctx = canvas.getContext('2d');
 
  // High DPI 대응: 실제 픽셀 데이터 크기 확인
  const actualWidth = canvas.width;   // 실제 buffer width (예: 1280)
  const actualHeight = canvas.height; // 실제 buffer height (예: 1280)
 
  if(actualWidth !== actualHeight || actualWidth % BOARD_SIZE !== 0) {
    alert('캔버스 설정 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.');
    return;
  }
 
  const imageData = ctx.getImageData(0, 0, actualWidth, actualHeight);
  const cells = [];
  const cellSize = actualWidth / BOARD_SIZE;  // 정확한 실제 픽셀 기준 셀 크기
 
  console.log('게시 시작: 캔버스 데이터 추출 중... (실제 크기:', actualWidth, 'x', actualHeight, ')');
 
  for(let gridY = 0; gridY < BOARD_SIZE; gridY++) {
    for(let gridX = 0; gridX < BOARD_SIZE; gridX++) {
      // 셀의 왼쪽 위 픽셀 (실제 buffer 기준)
      const pixelX = Math.floor(gridX * cellSize);
      const pixelY = Math.floor(gridY * cellSize);
 
      // 안전장치: 경계 초과 방지
      const safeX = Math.min(pixelX, actualWidth - 1);
      const safeY = Math.min(pixelY, actualHeight - 1);
 
      const index = (safeY * actualWidth + safeX) * 4;
 
      const r = imageData.data[index];
      const g = imageData.data[index + 1];
      const b = imageData.data[index + 2];
      const a = imageData.data[index + 3];
 
      // 완전한 흰색 배경(불투명)이 아닌 경우만 저장
      if(!(r === 255 && g === 255 && b === 255 && a === 255)) {
        const color = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        cells.push({
          x: gridX,
          y: gridY,
          color,
          nickname: currentNickname,
          uid: currentUser.uid
        });
      }
    }
  }
 
  console.log(`총 ${cells.length}개 셀 추출됨`);
 
  if(cells.length === 0) {
    alert('최소 1개 이상의 픽셀을 칠해주세요');
    return;
  }
 
  // 나머지 게시 로직은 기존과 동일
  try {
    const artworkId = 'artwork_' + Date.now();
   
    await setDoc(doc(db, 'artworks', artworkId), {
      title,
      createdAt: serverTimestamp(),
      likes: 0,
      likedBy: [],
      contributorCount: 1,
      creatorUid: currentUser.uid,
      creatorNickname: currentNickname
    });
   
    let savedCount = 0;
    for(const cell of cells) {
      const cellId = `${cell.x}_${cell.y}`;
      await setDoc(doc(db, 'artworks', artworkId, 'cells', cellId), {
        ...cell,
        updatedAt: serverTimestamp()
      });
      savedCount++;
      if(savedCount % 100 === 0) {
        console.log(`${savedCount}/${cells.length} 셀 저장 완료...`);
      }
    }
   
    await updateDoc(doc(db, 'users', currentUser.uid), {
      totalPixels: increment(cells.length)
    });
   
    alert('작품이 게시되었습니다!');
    showView('gallery');
  } catch(e) {
    console.error('게시 실패:', e);
    alert('게시 실패: ' + e.message);
  }
});

// ===================
// 필터 및 검색
// ===================
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    loadArtworks();
  });
});

document.getElementById('searchInput').addEventListener('input', () => {
  renderArtworks();
});

// ===================
// 작품 모달
// ===================
async function openArtwork(artworkId) {
  const artworkDoc = await getDoc(doc(db, 'artworks', artworkId));
  if(!artworkDoc.exists()) {
    alert('작품을 찾을 수 없습니다');
    return;
  }
  
  const artwork = artworkDoc.data();
  document.getElementById('modalTitle').textContent = artwork.title || '제목 없음';
  document.getElementById('modalLikes').textContent = artwork.likes || 0;
  document.getElementById('modalCreator').textContent = artwork.creatorNickname || '익명';
  
  // 삭제 버튼 표시 (관리자 또는 작성자)
  const deleteBtn = document.getElementById('deleteArtworkBtn');
  if(isAdmin || (currentUser && artwork.creatorUid === currentUser.uid)) {
    deleteBtn.classList.remove('hidden');
    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    newDeleteBtn.addEventListener('click', () => deleteArtwork(artworkId));
  } else {
    deleteBtn.classList.add('hidden');
  }
  
  // 좋아요 버튼 상태
  const likeBtn = document.getElementById('likeButton');
  const isLiked = artwork.likedBy && artwork.likedBy.includes(currentUser.uid);
  likeBtn.classList.toggle('liked', isLiked);
  
  // 좋아요 버튼 이벤트 (기존 리스너 제거 후 재등록)
  const newLikeBtn = likeBtn.cloneNode(true);
  likeBtn.parentNode.replaceChild(newLikeBtn, likeBtn);
  newLikeBtn.addEventListener('click', () => toggleLike(artworkId));
  
  // 캔버스 초기화
  const mCtx = modalCanvas.getContext('2d');
  modalCanvas.width = 640;
  modalCanvas.height = 640;
  mCtx.fillStyle = '#fff';
  mCtx.fillRect(0, 0, modalCanvas.width, modalCanvas.height);
  
  try {
    // 셀 데이터 로드
    const cellsRef = collection(db, 'artworks', artworkId, 'cells');
    const snapshot = await getDocs(cellsRef);
    
    console.log(`모달 렌더링: ${snapshot.size}개 셀 로드됨`);
    
    if(snapshot.empty) {
      console.warn('셀 데이터가 없습니다');
      alert('작품 데이터를 불러올 수 없습니다');
      return;
    }
    
    const contributors = new Set();
    const cellSize = modalCanvas.width / BOARD_SIZE;
    
    // 모든 셀을 배열로 변환
    const cells = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if(data && data.color && typeof data.x === 'number' && typeof data.y === 'number') {
        cells.push(data);
        if(data.nickname) contributors.add(data.nickname);
      }
    });
    
    console.log(`모달 렌더링: ${cells.length}개 유효한 셀 발견`);
    
    // 배치 렌더링
    mCtx.save();
    cells.forEach(cell => {
      mCtx.fillStyle = cell.color;
      mCtx.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
    });
    mCtx.restore();
    
    // 그리드 그리기
    mCtx.strokeStyle = '#e5e7eb';
    mCtx.lineWidth = 1;
    mCtx.beginPath();
    for(let i = 0; i <= BOARD_SIZE; i++) {
      const p = i * cellSize;
      mCtx.moveTo(p, 0);
      mCtx.lineTo(p, modalCanvas.height);
      mCtx.moveTo(0, p);
      mCtx.lineTo(modalCanvas.width, p);
    }
    mCtx.stroke();
    
    // 기여자 정보 업데이트
    document.getElementById('modalContributors').textContent = contributors.size;
    
    const contributorsList = document.getElementById('modalContributorsList');
    const sorted = Array.from(contributors).sort((a, b) => a.localeCompare(b, 'ko'));
    contributorsList.innerHTML = sorted.map(n => 
      `<span class="contributor-tag">${n}</span>`
    ).join('');
    
    artworkModal.classList.add('active');
    
  } catch(e) {
    console.error('모달 렌더링 실패:', e);
    alert('작품을 불러오는 중 오류가 발생했습니다');
  }
}

function closeModal() {
  artworkModal.classList.remove('active');
}

document.getElementById('modalCloseBtn').addEventListener('click', closeModal);

artworkModal.addEventListener('click', (e) => {
  if(e.target === artworkModal) closeModal();
});

// ===================
// 작품 삭제
// ===================
async function deleteArtwork(artworkId) {
  if(!confirm('정말 이 작품을 삭제하시겠습니까?')) return;
  
  try {
    // 셀 데이터 삭제
    const cellsRef = collection(db, 'artworks', artworkId, 'cells');
    const cellsSnapshot = await getDocs(cellsRef);
    
    for(const cellDoc of cellsSnapshot.docs) {
      await deleteDoc(cellDoc.ref);
    }
    
    // 작품 문서 삭제
    await deleteDoc(doc(db, 'artworks', artworkId));
    
    alert('작품이 삭제되었습니다');
    closeModal();
    loadArtworks();
  } catch(e) {
    alert('삭제 실패: ' + e.message);
  }
}

// ===================
// 좋아요
// ===================
async function toggleLike(artworkId) {
  const artworkRef = doc(db, 'artworks', artworkId);
  const artworkDoc = await getDoc(artworkRef);
  
  if(!artworkDoc.exists()) return;
  
  const artwork = artworkDoc.data();
  const isLiked = artwork.likedBy && artwork.likedBy.includes(currentUser.uid);
  
  if(isLiked) {
    await updateDoc(artworkRef, {
      likes: increment(-1),
      likedBy: arrayRemove(currentUser.uid)
    });
  } else {
    await updateDoc(artworkRef, {
      likes: increment(1),
      likedBy: arrayUnion(currentUser.uid)
    });
  }
  
  // UI 업데이트
  const likeBtn = document.getElementById('likeButton');
  likeBtn.classList.toggle('liked');
  
  const likesSpan = document.getElementById('modalLikes');
  likesSpan.textContent = parseInt(likesSpan.textContent) + (isLiked ? -1 : 1);
  
  loadArtworks();
}


