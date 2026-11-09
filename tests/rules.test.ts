// Firestore セキュリティルールのテスト。`npm run test:rules` でエミュレーター上で実行する。
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error JS のスクリプトを直接読み込む
import { buildRules } from '../scripts/build-rules.mjs';

const BOARD_ID = 'AbCdEfGhIjKlMnOpQrSt';
const STICKY_ID = 'StIcKyIdStIcKyId0001';

let env: RulesTestEnvironment;

function employee(uid: string, email = `${uid}@example.com`, overrides: Record<string, unknown> = {}) {
  return env
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      ...overrides,
    } as never)
    .firestore() as unknown as Firestore;
}

const alice = () => employee('alice');
const bob = () => employee('bob');

function boardData(ownerUid = 'alice') {
  return {
    title: 'ブレスト',
    ownerUid,
    ownerName: 'Alice',
    visibility: 'link',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
  };
}

function common(uid: string) {
  return {
    x: 0,
    y: 0,
    z: 1,
    createdBy: { uid, name: uid, photoURL: null },
    createdAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    deleted: false,
    locked: false,
  };
}

function stickyData(uid = 'alice') {
  return { type: 'sticky', ...common(uid), w: 160, h: 160, text: 'アイデア', color: 'yellow', parentId: null };
}

function sectionData(uid = 'alice') {
  return { type: 'section', ...common(uid), w: 600, h: 400, title: 'まとめ', color: 'gray' };
}

function textData(uid = 'alice') {
  return {
    type: 'text',
    ...common(uid),
    w: 240,
    h: 40,
    text: 'お題',
    fontSize: 24,
    color: 'black',
    autoWidth: true,
    parentId: null,
  };
}

const IMAGE_ID = 'ImAgEiDiMaGeIdImAgE1';
function imageData(uid = 'alice', src = `boards/${BOARD_ID}/images/${IMAGE_ID}.webp`) {
  return { type: 'image', ...common(uid), w: 400, h: 200, src, parentId: null };
}

const CONNECTOR_ID = 'CoNnEcToRcOnNeCtOr01';
function connectorData(uid = 'alice', fromId = STICKY_ID, toId = 'OtHeRsTiCkYoThErStI') {
  return { type: 'connector', ...common(uid), x: 0, y: 0, fromId, toId, label: '' };
}

function stampData(uid = 'alice') {
  return { type: 'stamp', ...common(uid), stampKind: 'like', targetId: STICKY_ID };
}

/** 他人が更新するときに付けるメタ情報 */
function touch(uid: string) {
  return { updatedBy: uid, updatedAt: serverTimestamp() };
}

async function seed(fn: (db: Firestore) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore() as unknown as Firestore));
}

async function seedBoard() {
  await seed((db) => setDoc(doc(db, 'boards', BOARD_ID), boardData()));
}

async function seedSticky() {
  await seedBoard();
  await seed((db) => setDoc(doc(db, 'boards', BOARD_ID, 'objects', STICKY_ID), stickyData()));
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nboard-rules-test',
    firestore: { rules: buildRules(['example.com']) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('ログインの制限', () => {
  beforeEach(seedBoard);
  const read = (db: Firestore) => getDoc(doc(db, 'boards', BOARD_ID));

  it('組織のドメインのGoogleアカウントなら読める', async () => {
    await assertSucceeds(read(alice()));
  });

  it('大文字のドメインでも読める', async () => {
    await assertSucceeds(read(employee('carol', 'Carol@EXAMPLE.COM')));
  });

  it('未ログインは拒否', async () => {
    await assertFails(read(env.unauthenticatedContext().firestore() as unknown as Firestore));
  });

  it('他ドメインは拒否', async () => {
    await assertFails(read(employee('mallory', 'mallory@gmail.com')));
  });

  it('ドメインに似せたアドレスは拒否', async () => {
    await assertFails(read(employee('m1', 'm@example.com.evil.jp')));
    await assertFails(read(employee('m2', 'm@evil-example.com')));
    await assertFails(read(employee('m3', 'm@sub.example.com')));
  });

  it('メール未確認は拒否', async () => {
    await assertFails(read(employee('m4', 'm4@example.com', { email_verified: false })));
  });

  it('Google以外のログイン方法は拒否', async () => {
    await assertFails(read(employee('m5', 'm5@example.com', { firebase: { sign_in_provider: 'password' } })));
  });
});

describe('ボード', () => {
  it('作成できる', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'boards', BOARD_ID), boardData()));
  });

  it('短い（推測されやすい）IDでは作成できない', async () => {
    await assertFails(setDoc(doc(alice(), 'boards', 'board1'), boardData()));
  });

  it('他人を作成者にして作成できない', async () => {
    await assertFails(setDoc(doc(alice(), 'boards', BOARD_ID), boardData('bob')));
  });

  it('想定外の項目や公開範囲では作成できない', async () => {
    await assertFails(setDoc(doc(alice(), 'boards', BOARD_ID), { ...boardData(), extra: 1 }));
    await assertFails(setDoc(doc(alice(), 'boards', BOARD_ID), { ...boardData(), visibility: 'public' }));
    await assertFails(setDoc(doc(alice(), 'boards', BOARD_ID), { ...boardData(), title: '' }));
  });

  it('一覧取得は禁止', async () => {
    await seedBoard();
    await assertFails(getDocs(collection(alice(), 'boards')));
  });

  it('IDを知っていれば他の組織のメンバーも開ける', async () => {
    await seedBoard();
    await assertSucceeds(getDoc(doc(bob(), 'boards', BOARD_ID)));
  });

  it('存在しないボードは「存在しない」と分かる', async () => {
    const snap = await assertSucceeds(getDoc(doc(alice(), 'boards', 'NoSuchBoardNoSuchBrd')));
    expect(snap.exists()).toBe(false);
  });

  it('他の組織のメンバーもタイトルを変更できる', async () => {
    await seedBoard();
    await assertSucceeds(
      updateDoc(doc(bob(), 'boards', BOARD_ID), { title: '新しい題', updatedAt: serverTimestamp() }),
    );
  });

  it('タイトル以外は変更できない', async () => {
    await seedBoard();
    await assertFails(updateDoc(doc(bob(), 'boards', BOARD_ID), { ownerUid: 'bob', updatedAt: serverTimestamp() }));
    await assertFails(
      updateDoc(doc(alice(), 'boards', BOARD_ID), { visibility: 'invited', updatedAt: serverTimestamp() }),
    );
  });

  it('作成者以外は削除できない', async () => {
    await seedBoard();
    await assertFails(deleteDoc(doc(bob(), 'boards', BOARD_ID)));
  });

  it('作成者は削除できる', async () => {
    await seedBoard();
    await assertSucceeds(deleteDoc(doc(alice(), 'boards', BOARD_ID)));
  });
});

describe('オブジェクト', () => {
  const stickyRef = (db: Firestore) => doc(db, 'boards', BOARD_ID, 'objects', STICKY_ID);

  it('付箋・セクション・スタンプを作成できる', async () => {
    await seedBoard();
    await assertSucceeds(setDoc(stickyRef(bob()), stickyData('bob')));
    await assertSucceeds(setDoc(doc(bob(), 'boards', BOARD_ID, 'objects', 'SeCtIoNiDsEcTiOnId01'), sectionData('bob')));
    await assertSucceeds(setDoc(doc(bob(), 'boards', BOARD_ID, 'objects', 'StAmPiDsTaMpIdStAmP1'), stampData('bob')));
  });

  it('テキストを作成・編集できる', async () => {
    await seedBoard();
    const ref = doc(bob(), 'boards', BOARD_ID, 'objects', 'TeXtIdTeXtIdTeXtId01');
    await assertSucceeds(setDoc(ref, textData('bob')));
    await assertSucceeds(updateDoc(ref, { text: '今日のお題', fontSize: 56, color: 'blue', w: 400, h: 90, ...touch('bob') }));
  });

  it('テキストに不正な値は入れられない', async () => {
    await seedBoard();
    const ref = doc(alice(), 'boards', BOARD_ID, 'objects', 'TeXtIdTeXtIdTeXtId02');
    await assertFails(setDoc(ref, { ...textData(), fontSize: 99 }));
    await assertFails(setDoc(ref, { ...textData(), color: 'yellow' }));
    await assertFails(setDoc(ref, { ...textData(), title: 'x' }));
    await assertFails(setDoc(ref, { ...textData(), autoWidth: 'yes' }));
  });

  it('自動の幅の項目がない古いテキストも編集できる', async () => {
    await seedBoard();
    const { autoWidth: _omit, ...old } = textData();
    await seed((db) => setDoc(doc(db, 'boards', BOARD_ID, 'objects', 'TeXtIdTeXtIdTeXtId03'), old));
    const ref = doc(bob(), 'boards', BOARD_ID, 'objects', 'TeXtIdTeXtIdTeXtId03');
    await assertSucceeds(updateDoc(ref, { text: '更新', ...touch('bob') }));
    await assertSucceeds(updateDoc(ref, { autoWidth: true, ...touch('bob') }));
  });

  it('他人の名前で作成できない', async () => {
    await seedBoard();
    await assertFails(setDoc(stickyRef(bob()), stickyData('alice')));
  });

  it('存在しないボードには作成できない', async () => {
    await assertFails(setDoc(stickyRef(alice()), stickyData()));
  });

  it('不正な値では作成できない', async () => {
    await seedBoard();
    await assertFails(setDoc(stickyRef(alice()), { ...stickyData(), color: 'red' }));
    await assertFails(setDoc(stickyRef(alice()), { ...stickyData(), text: 'あ'.repeat(2001) }));
    await assertFails(setDoc(stickyRef(alice()), { ...stickyData(), extra: true }));
    await assertFails(setDoc(stickyRef(alice()), { ...stickyData(), type: 'image' }));
    await assertFails(setDoc(stickyRef(alice()), { ...stickyData(), locked: true }));
    await assertFails(setDoc(stickyRef(alice()), { ...stickyData(), deleted: true }));
    await assertFails(setDoc(stickyRef(alice()), { ...stampData(), stampKind: 'poop' }));
  });

  it('他人の付箋を編集・移動・論理削除できる', async () => {
    await seedSticky();
    await assertSucceeds(updateDoc(stickyRef(bob()), { text: '追記', x: 100, y: 50, ...touch('bob') }));
    await assertSucceeds(updateDoc(stickyRef(bob()), { deleted: true, ...touch('bob') }));
    await assertSucceeds(updateDoc(stickyRef(bob()), { deleted: false, ...touch('bob') }));
  });

  it('スタンプを動かして付け先を変更できる', async () => {
    await seedBoard();
    const stampRef = doc(bob(), 'boards', BOARD_ID, 'objects', 'StAmPiDsTaMpIdStAmP1');
    await seed((db) => setDoc(doc(db, 'boards', BOARD_ID, 'objects', 'StAmPiDsTaMpIdStAmP1'), stampData()));
    await assertSucceeds(updateDoc(stampRef, { x: 400, y: 300, targetId: null, ...touch('bob') }));
    await assertSucceeds(updateDoc(stampRef, { x: 10, y: 10, targetId: STICKY_ID, ...touch('bob') }));
    await assertFails(updateDoc(stampRef, { targetId: 123, ...touch('bob') }));
  });

  it('更新者を偽れない', async () => {
    await seedSticky();
    await assertFails(updateDoc(stickyRef(bob()), { x: 1, updatedBy: 'alice', updatedAt: serverTimestamp() }));
  });

  it('種類・作成者は変更できない', async () => {
    await seedSticky();
    await assertFails(
      updateDoc(stickyRef(bob()), { createdBy: { uid: 'bob', name: 'bob', photoURL: null }, ...touch('bob') }),
    );
    await assertFails(updateDoc(stickyRef(bob()), { type: 'section', ...touch('bob') }));
  });

  it('物理削除はボード作成者のみ', async () => {
    await seedSticky();
    await assertFails(deleteDoc(stickyRef(bob())));
    await assertSucceeds(deleteDoc(stickyRef(alice())));
  });

  it('組織の外の人は読めない', async () => {
    await seedSticky();
    await assertFails(getDocs(collection(employee('m', 'm@gmail.com'), 'boards', BOARD_ID, 'objects')));
  });

  it('ボード削除後は残ったデータを読めない', async () => {
    await seedSticky();
    await seed((db) => deleteDoc(doc(db, 'boards', BOARD_ID)));
    await assertFails(getDoc(stickyRef(alice())));
  });

  it('ボード内のオブジェクトを一覧で読める', async () => {
    await seedSticky();
    await assertSucceeds(getDocs(collection(bob(), 'boards', BOARD_ID, 'objects')));
  });

  it('画像を作成して、動かす・大きさを変えることができる', async () => {
    await seedBoard();
    const ref = doc(bob(), 'boards', BOARD_ID, 'objects', IMAGE_ID);
    await assertSucceeds(setDoc(ref, imageData('bob')));
    await assertSucceeds(updateDoc(ref, { x: 100, y: 50, w: 460, h: 230, ...touch('bob') }));
  });

  it('画像の置き場所は、このボードの画像だけを指せて、あとから変えられない', async () => {
    await seedBoard();
    const ref = doc(bob(), 'boards', BOARD_ID, 'objects', IMAGE_ID);
    await assertFails(setDoc(ref, imageData('bob', `boards/OtHeRbOaRdOtHeRbOaRd/images/${IMAGE_ID}.webp`)));
    await assertFails(setDoc(ref, imageData('bob', `boards/${BOARD_ID}/images/${IMAGE_ID}.svg`)));
    await assertFails(setDoc(ref, imageData('bob', 'https://example.com/a.png')));
    await assertSucceeds(setDoc(ref, imageData('bob')));
    await assertFails(
      updateDoc(ref, { src: `boards/${BOARD_ID}/images/OtHeRiMaGeOtHeRiMaGe.png`, ...touch('bob') }),
    );
  });

  it('矢印を作り、言葉を添えたり向きを変えたり削除したりできる', async () => {
    await seedBoard();
    const ref = doc(bob(), 'boards', BOARD_ID, 'objects', CONNECTOR_ID);
    await assertSucceeds(setDoc(ref, connectorData('bob')));
    await assertSucceeds(updateDoc(ref, { label: 'はい', ...touch('bob') }));
    await assertSucceeds(updateDoc(ref, { fromId: 'OtHeRsTiCkYoThErStI', toId: STICKY_ID, ...touch('bob') }));
    await assertSucceeds(updateDoc(ref, { bothEnds: true, ...touch('bob') }));
    await assertFails(updateDoc(ref, { bothEnds: 'yes', ...touch('bob') }));
    await assertSucceeds(updateDoc(ref, { deleted: true, ...touch('bob') }));
  });

  it('同じものどうしをつなぐ矢印・長すぎる言葉・余計な項目は保存できない', async () => {
    await seedBoard();
    const ref = doc(bob(), 'boards', BOARD_ID, 'objects', CONNECTOR_ID);
    await assertFails(setDoc(ref, connectorData('bob', STICKY_ID, STICKY_ID)));
    await assertFails(setDoc(ref, { ...connectorData('bob'), label: 'あ'.repeat(51) }));
    await assertFails(setDoc(ref, { ...connectorData('bob'), w: 100 }));
    await assertFails(setDoc(ref, { ...connectorData('bob'), fromId: '' }));
    await assertSucceeds(setDoc(ref, connectorData('bob')));
    await assertFails(updateDoc(ref, { toId: STICKY_ID, ...touch('bob') }));
  });
});

describe('共有範囲（招待した人だけ）', () => {
  const invited = (memberEmails: string[]) =>
    seed((db) =>
      setDoc(doc(db, 'boards', BOARD_ID), { ...boardData(), visibility: 'invited', memberEmails }),
    );
  const read = (db: Firestore) => getDoc(doc(db, 'boards', BOARD_ID));

  it('作成者と、招待したメールアドレスの人だけが開ける', async () => {
    await invited(['bob@example.com']);
    await assertSucceeds(read(alice()));
    await assertSucceeds(read(bob()));
    await assertFails(read(employee('carol')));
    await assertFails(getDocs(collection(employee('carol'), 'boards', BOARD_ID, 'objects')));
  });

  it('メールアドレスの大文字・小文字は区別しない', async () => {
    await invited(['bob@example.com']);
    await assertSucceeds(read(employee('bob', 'Bob@Example.com')));
  });

  it('共有範囲と招待は作成者だけが変えられる', async () => {
    await seedBoard();
    const change = (db: Firestore) =>
      updateDoc(doc(db, 'boards', BOARD_ID), {
        visibility: 'invited',
        memberEmails: ['bob@example.com'],
        updatedAt: serverTimestamp(),
      });
    await assertFails(change(bob()));
    await assertSucceeds(change(alice()));
  });

  it('招待されている人もボード名は変えられる', async () => {
    await invited(['bob@example.com']);
    await assertSucceeds(updateDoc(doc(bob(), 'boards', BOARD_ID), { title: '新しい名前', updatedAt: serverTimestamp() }));
  });

  it('不正な共有範囲や、多すぎる招待は保存できない', async () => {
    await seedBoard();
    const ref = doc(alice(), 'boards', BOARD_ID);
    await assertFails(updateDoc(ref, { visibility: 'public', memberEmails: [], updatedAt: serverTimestamp() }));
    const many = Array.from({ length: 101 }, (_, i) => `u${i}@example.com`);
    await assertFails(updateDoc(ref, { visibility: 'invited', memberEmails: many, updatedAt: serverTimestamp() }));
  });
});

describe('ログインしたことがある人（招待の候補）', () => {
  const profile = (uid: string, email = `${uid}@example.com`) => ({
    name: uid,
    email,
    photoURL: null,
    updatedAt: serverTimestamp(),
  });

  it('本人だけが、自分のメールアドレスで記録できる', async () => {
    await assertSucceeds(setDoc(doc(bob(), 'users', 'bob'), profile('bob')));
    await assertFails(setDoc(doc(bob(), 'users', 'alice'), profile('alice')));
    await assertFails(setDoc(doc(bob(), 'users', 'bob'), profile('bob', 'alice@example.com')));
  });

  it('組織のメンバーなら一覧を読めるが、組織の外の人は読めない', async () => {
    await seed((db) => setDoc(doc(db, 'users', 'bob'), profile('bob')));
    await assertSucceeds(getDocs(collection(alice(), 'users')));
    await assertFails(getDocs(collection(employee('m', 'm@gmail.com'), 'users')));
  });
});

describe('コメント', () => {
  const COMMENT_ID = 'CoMmEnTiDcOmMeNtId01';
  const commentRef = (db: Firestore, id = COMMENT_ID) => doc(db, 'boards', BOARD_ID, 'comments', id);
  const comment = (uid: string, text = '賛成です') => ({
    targetId: STICKY_ID,
    text,
    createdBy: { uid, name: uid, photoURL: null },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    edited: false,
    deleted: false,
  });
  const seedComment = async (uid = 'bob') => {
    await seedSticky();
    await seed((db) => setDoc(commentRef(db), comment(uid)));
  };

  it('参加者は付箋にコメントでき、ボードのコメントを一覧で読める', async () => {
    await seedSticky();
    await assertSucceeds(setDoc(commentRef(bob()), comment('bob')));
    await assertSucceeds(getDocs(collection(alice(), 'boards', BOARD_ID, 'comments')));
  });

  it('他人の名前や不正な値ではコメントできない', async () => {
    await seedSticky();
    await assertFails(setDoc(commentRef(bob()), comment('alice')));
    await assertFails(setDoc(commentRef(bob()), comment('bob', '')));
    await assertFails(setDoc(commentRef(bob()), comment('bob', 'あ'.repeat(1001))));
    await assertFails(setDoc(commentRef(bob()), { ...comment('bob'), edited: true }));
    await assertFails(setDoc(commentRef(bob()), { ...comment('bob'), deleted: true }));
    await assertFails(setDoc(commentRef(bob()), { ...comment('bob'), color: 'red' }));
    await assertFails(setDoc(commentRef(bob(), 'short'), comment('bob')));
  });

  it('本文を直せるのは書いた本人だけ（ボード作成者も直せない）', async () => {
    await seedComment('bob');
    await assertFails(updateDoc(commentRef(alice()), { text: '書き換え', edited: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(commentRef(employee('carol')), { text: '書き換え', edited: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(commentRef(bob()), { text: '直した', edited: false, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(commentRef(bob()), { targetId: 'OtHeRsTiCkYiD000001', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(commentRef(bob()), { text: '直した', edited: true, updatedAt: serverTimestamp() }));
  });

  it('削除できるのは書いた本人とボード作成者だけ', async () => {
    await seedComment('bob');
    const del = { deleted: true, updatedAt: serverTimestamp() };
    await assertFails(updateDoc(commentRef(employee('carol')), del));
    await assertSucceeds(updateDoc(commentRef(alice()), del));
    await seed((db) => setDoc(commentRef(db), comment('bob')));
    await assertSucceeds(updateDoc(commentRef(bob()), del));
  });

  it('削除したコメントは元に戻せず、直すこともできない', async () => {
    await seedComment('bob');
    await seed((db) => updateDoc(commentRef(db), { deleted: true }));
    await assertFails(updateDoc(commentRef(bob()), { deleted: false, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(commentRef(bob()), { text: '直した', edited: true, updatedAt: serverTimestamp() }));
  });

  it('物理削除はボード作成者のみ。組織の外の人は読めない', async () => {
    await seedComment('bob');
    await assertFails(deleteDoc(commentRef(bob())));
    await assertSucceeds(deleteDoc(commentRef(alice())));
    await assertFails(getDoc(commentRef(employee('m', 'm@gmail.com'))));
  });
});

describe('参加中の人', () => {
  const presence = (uid: string) => ({ name: uid, photoURL: null, lastSeen: serverTimestamp() });

  it('自分の分だけ書き込める', async () => {
    await seedBoard();
    await assertSucceeds(setDoc(doc(bob(), 'boards', BOARD_ID, 'presence', 'bob'), presence('bob')));
    await assertFails(setDoc(doc(bob(), 'boards', BOARD_ID, 'presence', 'alice'), presence('alice')));
  });
});

describe('タイマー', () => {
  const timerRef = (db: Firestore) => doc(db, 'boards', BOARD_ID, 'state', 'timer');
  const running = (uid: string) => ({
    status: 'running',
    durationMs: 300000,
    remainingMs: 300000,
    startedAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });

  it('参加者は誰でも開始・一時停止・終了できる', async () => {
    await seedBoard();
    await assertSucceeds(setDoc(timerRef(bob()), running('bob')));
    await assertSucceeds(
      setDoc(timerRef(alice()), {
        status: 'paused',
        durationMs: 300000,
        remainingMs: 120000,
        startedAt: null,
        updatedBy: 'alice',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(timerRef(bob()), {
        status: 'idle',
        durationMs: 0,
        remainingMs: 0,
        startedAt: null,
        updatedBy: 'bob',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('動いている間の +1分 では開始時刻をそのまま使える', async () => {
    await seedBoard();
    await assertSucceeds(setDoc(timerRef(bob()), running('bob')));
    const startedAt = (await getDoc(timerRef(bob()))).data()!.startedAt;
    await assertSucceeds(
      setDoc(timerRef(alice()), { ...running('alice'), durationMs: 360000, remainingMs: 360000, startedAt }),
    );
  });

  it('開始時刻を自由に決めることはできない', async () => {
    await seedBoard();
    await assertFails(setDoc(timerRef(bob()), { ...running('bob'), startedAt: new Date(2000, 0, 1) }));
  });

  it('不正な値や別の名前のドキュメントは拒否', async () => {
    await seedBoard();
    await assertFails(setDoc(timerRef(bob()), { ...running('bob'), status: 'exploded' }));
    await assertFails(setDoc(timerRef(bob()), { ...running('bob'), remainingMs: -1 }));
    await assertFails(setDoc(timerRef(bob()), { ...running('bob'), durationMs: 6000000, remainingMs: 6000000 }));
    await assertFails(setDoc(timerRef(bob()), { ...running('bob'), updatedBy: 'alice' }));
    await assertFails(setDoc(doc(bob(), 'boards', BOARD_ID, 'state', 'other'), running('bob')));
  });

  it('組織の外の人は読めない', async () => {
    await seedBoard();
    await assertFails(getDoc(timerRef(employee('m', 'm@gmail.com'))));
  });
});

describe('BGM', () => {
  const bgmRef = (db: Firestore) => doc(db, 'boards', BOARD_ID, 'state', 'bgm');
  const bgm = (uid: string, trackId: string | null) => ({ trackId, updatedBy: uid, updatedAt: serverTimestamp() });

  it('参加者は誰でも曲を流す・止めることができる', async () => {
    await seedBoard();
    await assertSucceeds(setDoc(bgmRef(bob()), bgm('bob', 'relax')));
    await assertSucceeds(setDoc(bgmRef(alice()), bgm('alice', 'happy')));
    await assertSucceeds(setDoc(bgmRef(bob()), bgm('bob', null)));
  });

  it('一覧にない曲や不正な値は拒否', async () => {
    await seedBoard();
    await assertFails(setDoc(bgmRef(bob()), bgm('bob', 'rock')));
    await assertFails(setDoc(bgmRef(bob()), bgm('bob', 'calm')));
    await assertFails(setDoc(bgmRef(bob()), { ...bgm('bob', 'relax'), volume: 1 }));
    await assertFails(setDoc(bgmRef(bob()), bgm('alice', 'relax')));
  });

  it('組織の外の人は読めない', async () => {
    await seedBoard();
    await assertFails(getDoc(bgmRef(employee('m', 'm@gmail.com'))));
  });
});

describe('履歴', () => {
  const entry = { title: 'ブレスト', ownerUid: 'alice', lastOpenedAt: serverTimestamp() };

  it('自分の履歴は読み書きできる', async () => {
    await assertSucceeds(setDoc(doc(bob(), 'users', 'bob', 'history', BOARD_ID), entry));
    await assertSucceeds(getDocs(collection(bob(), 'users', 'bob', 'history')));
  });

  it('付箋とコメントの数を記録できる。不正な数は拒否', async () => {
    const ref = doc(bob(), 'users', 'bob', 'history', BOARD_ID);
    await assertSucceeds(setDoc(ref, { ...entry, stickyCount: 32, commentCount: 12 }));
    await assertSucceeds(setDoc(ref, { stickyCount: 33, commentCount: 12 }, { merge: true }));
    await assertFails(setDoc(ref, { stickyCount: -1 }, { merge: true }));
    await assertFails(setDoc(ref, { commentCount: 1.5 }, { merge: true }));
    await assertFails(setDoc(ref, { stickyCount: '32' }, { merge: true }));
  });

  it('他人の履歴は読み書きできない', async () => {
    await assertFails(setDoc(doc(bob(), 'users', 'alice', 'history', BOARD_ID), entry));
    await assertFails(getDocs(collection(bob(), 'users', 'alice', 'history')));
  });
});
