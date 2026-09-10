// Mock fiel da API do Firebase v8 "compat" (Auth + Firestore) — usado só pra testar,
// via Playwright, a integração que o app faz com o Firebase (login, CRUD, onSnapshot),
// sem precisar de um projeto Firebase real (bloqueado nesse ambiente de teste).
// Credenciais fixas de teste: dono@teste.com / senha123 (ver EMAIL_TESTE/SENHA_TESTE abaixo).
(function () {
  const EMAIL_TESTE = 'dono@teste.com';
  const SENHA_TESTE = 'senha123';

  function uid() { return Math.random().toString(36).slice(2, 12); }

  class FakeAuth {
    constructor() { this._user = null; this._listeners = []; }
    onAuthStateChanged(cb) {
      this._listeners.push(cb);
      Promise.resolve().then(() => cb(this._user));
      return () => { this._listeners = this._listeners.filter(l => l !== cb); };
    }
    signInWithEmailAndPassword(email, senha) {
      return new Promise((resolve, reject) => {
        if (email === EMAIL_TESTE && senha === SENHA_TESTE) {
          this._user = { email };
          this._listeners.forEach(cb => cb(this._user));
          resolve({ user: this._user });
        } else {
          reject({ code: 'auth/invalid-credential', message: 'invalid credential' });
        }
      });
    }
    signOut() {
      this._user = null;
      this._listeners.forEach(cb => cb(null));
      return Promise.resolve();
    }
  }

  class FakeFirestore {
    constructor() {
      this.store = {}; // { colecao: { id: data } }
      this._docListeners = {}; // { "colecao/id": [cb,...] }
      this._colListeners = {}; // { colecao: [cb,...] }
    }
    _fireDoc(colecao, id) {
      const key = colecao + '/' + id;
      const listeners = this._docListeners[key] || [];
      const exists = !!(this.store[colecao] && (id in this.store[colecao]));
      const data = exists ? this.store[colecao][id] : undefined;
      listeners.forEach(cb => cb({ exists, data: () => data, id }));
    }
    _fireCol(colecao) {
      const listeners = this._colListeners[colecao] || [];
      const docs = Object.entries(this.store[colecao] || {}).map(([id, data]) => ({ id, data: () => data }));
      listeners.forEach(cb => cb({ docs }));
    }
    doc(path) {
      const [colecao, id] = path.split('/');
      return this._docRef(colecao, id);
    }
    collection(colecao) {
      const self = this;
      return {
        doc(id) { return self._docRef(colecao, id); },
        add(data) {
          const id = uid();
          self.store[colecao] = self.store[colecao] || {};
          self.store[colecao][id] = { ...data };
          self._fireCol(colecao);
          return Promise.resolve({ id });
        },
        onSnapshot(cb, errCb) {
          self._colListeners[colecao] = self._colListeners[colecao] || [];
          self._colListeners[colecao].push(cb);
          const docs = Object.entries(self.store[colecao] || {}).map(([id, data]) => ({ id, data: () => data }));
          Promise.resolve().then(() => cb({ docs }));
          return () => {};
        },
      };
    }
    _docRef(colecao, id) {
      const self = this;
      return {
        set(data) {
          self.store[colecao] = self.store[colecao] || {};
          self.store[colecao][id] = { ...data };
          self._fireDoc(colecao, id);
          self._fireCol(colecao);
          return Promise.resolve();
        },
        update(data) {
          if (!self.store[colecao] || !(id in self.store[colecao])) {
            return Promise.reject({ code: 'not-found', message: 'no document to update' });
          }
          self.store[colecao][id] = { ...self.store[colecao][id], ...data };
          self._fireDoc(colecao, id);
          self._fireCol(colecao);
          return Promise.resolve();
        },
        delete() {
          if (self.store[colecao]) delete self.store[colecao][id];
          self._fireDoc(colecao, id);
          self._fireCol(colecao);
          return Promise.resolve();
        },
        onSnapshot(cb, errCb) {
          const key = colecao + '/' + id;
          self._docListeners[key] = self._docListeners[key] || [];
          self._docListeners[key].push(cb);
          const exists = !!(self.store[colecao] && (id in self.store[colecao]));
          const data = exists ? self.store[colecao][id] : undefined;
          Promise.resolve().then(() => cb({ exists, data: () => data, id }));
          return () => {};
        },
      };
    }
  }

  window.firebase = {
    initializeApp(config) { window.__fbConfig = config; },
    auth() {
      if (!window.__fakeAuth) window.__fakeAuth = new FakeAuth();
      return window.__fakeAuth;
    },
    firestore() {
      if (!window.__fakeDb) window.__fakeDb = new FakeFirestore();
      return window.__fakeDb;
    },
  };
  window.__EMAIL_TESTE = EMAIL_TESTE;
  window.__SENHA_TESTE = SENHA_TESTE;
})();
