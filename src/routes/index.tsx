import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  createContext,
  useContext,
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  ConfigProvider,
  theme as antdTheme,
  Progress,
  Button,
  Drawer,
  Form,
  InputNumber,
  Segmented,
  Select,
  Input,
  Empty,
  Popconfirm,
  message,
  Tag,
  Alert,
} from "antd";
import {
  PlusOutlined,
  ThunderboltFilled,
  HeartFilled,
  TrophyFilled,
  DeleteOutlined,
  SwapOutlined,
  FireFilled,
  RiseOutlined,
  FallOutlined,
  WarningFilled,
  ReloadOutlined,
} from "@ant-design/icons";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GoldKeeper — RPG ֆինանսային արկած" },
      {
        name: "description",
        content:
          "Խաղայնացված անձնական ֆինանսների վահանակ։ Հետևի՛ր քո Ոսկուն, կառավարի՛ր Մանա և Կենսունակություն դրամապանակները։",
      },
      { property: "og:title", content: "GoldKeeper — RPG ֆինանսային արկած" },
      {
        property: "og:description",
        content:
          "Խաղայնացված անձնական ֆինանսների վահանակ։ Հետևի՛ր քո Ոսկուն, կառավարի՛ր Մանա և Կենսունակություն դրամապանակները։",
      },
    ],
  }),
  component: GoldKeeperRoot,
});


/* ============================ Types ============================ */

type Wallet = "CARD" | "CASH";
type TxType = "INCOME" | "EXPENSE" | "TRANSFER";

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  wallet: Wallet;          // source wallet for EXPENSE/TRANSFER, target for INCOME
  toWallet?: Wallet;       // only for TRANSFER
  category: string;
  note?: string;
  createdAt: number;
}

interface FloatText {
  id: string;
  kind: "heal" | "damage" | "transfer";
  text: string;
}

/* ============================ Constants ============================ */

const STORAGE_KEY = "goldkeeper.v1.transactions";
const LEVEL_UNIT = 100000;

const COLORS = {
  bg: "#141414",
  panel: "#1b1b1f",
  panel2: "#222228",
  border: "#2a2a33",
  text: "#f5f5f7",
  sub: "#8b8b95",
  mana: "#1890ff",
  hp: "#52c41a",
  gold: "#fadb14",
  danger: "#ff4d4f",
  transfer: "#9254de",
};

const CATEGORIES: Record<TxType, string[]> = {
  INCOME: ["Քվեստի վարձատրություն", "Ավար / Loot", "Օրական առաջադրանք", "Գանձի սնդուկ", "Առևտրի շահույթ"],
  EXPENSE: [
    "Սնունդ / Խմիչքներ",
    "Տրանսպորտ / Ձի",
    "Զրահ / Սարքավորում",
    "Պանդոկ / Ժամանց",
    "Կախարդանքներ / Բաժանորդագրություններ",
    "Բուժում / Առողջություն",
    "Այլ մագաղաթ",
  ],
  TRANSFER: ["Դրամապանակների փոխանցում"],
};


/* ============================ Storage ============================ */

const loadTx = (): Transaction[] => {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && typeof t.id === "string");
  } catch {
    return [];
  }
};

const saveTx = (tx: Transaction[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tx));
  } catch {
    /* ignore quota errors */
  }
};

/* ============================ Context ============================ */

interface VaultCtx {
  ready: boolean;
  transactions: Transaction[];
  cardBalance: number;
  cashBalance: number;
  netWorth: number;
  level: number;
  levelProgress: number; // 0..100
  goldIntoLevel: number;
  goldToNext: number;
  addTransaction: (t: Omit<Transaction, "id" | "createdAt">) => void;
  removeTransaction: (id: string) => void;
  pushFloat: (f: Omit<FloatText, "id">) => void;
  floats: FloatText[];
  dismissFloat: (id: string) => void;
}

const VaultContext = createContext<VaultCtx | null>(null);
const useVault = () => {
  const c = useContext(VaultContext);
  if (!c) throw new Error("VaultContext missing");
  return c;
};

/* ============================ Provider ============================ */

function VaultProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [floats, setFloats] = useState<FloatText[]>([]);

  useEffect(() => {
    setTransactions(loadTx());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveTx(transactions);
  }, [transactions, ready]);

  const { cardBalance, cashBalance } = useMemo(() => {
    let card = 0;
    let cash = 0;
    for (const t of transactions) {
      if (t.type === "INCOME") {
        if (t.wallet === "CARD") card += t.amount;
        else cash += t.amount;
      } else if (t.type === "EXPENSE") {
        if (t.wallet === "CARD") card -= t.amount;
        else cash -= t.amount;
      } else if (t.type === "TRANSFER" && t.toWallet) {
        if (t.wallet === "CARD") {
          card -= t.amount;
          cash += t.amount;
        } else {
          cash -= t.amount;
          card += t.amount;
        }
      }
    }
    return { cardBalance: card, cashBalance: cash };
  }, [transactions]);

  const netWorth = cardBalance + cashBalance;
  const level = Math.floor(Math.max(0, netWorth) / LEVEL_UNIT) + 1;
  const goldIntoLevel = Math.max(0, netWorth) - (level - 1) * LEVEL_UNIT;
  const goldToNext = LEVEL_UNIT - goldIntoLevel;
  const levelProgress = Math.min(100, Math.max(0, (goldIntoLevel / LEVEL_UNIT) * 100));

  const pushFloat: VaultCtx["pushFloat"] = useCallback((f) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setFloats((prev) => [...prev, { id, ...f }]);
  }, []);

  const dismissFloat = useCallback((id: string) => {
    setFloats((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const addTransaction: VaultCtx["addTransaction"] = useCallback(
    (t) => {
      const newTx: Transaction = {
        ...t,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
      };
      setTransactions((prev) => [newTx, ...prev]);
      if (t.type === "INCOME") {
        pushFloat({ kind: "heal", text: `+${formatAmount(t.amount)} ֏` });
      } else if (t.type === "EXPENSE") {
        pushFloat({ kind: "damage", text: `-${formatAmount(t.amount)} ֏` });
      } else {
        pushFloat({ kind: "transfer", text: `⇄ ${formatAmount(t.amount)} ֏` });
      }
    },
    [pushFloat],
  );

  const removeTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: VaultCtx = {
    ready,
    transactions,
    cardBalance,
    cashBalance,
    netWorth,
    level,
    levelProgress,
    goldIntoLevel,
    goldToNext,
    addTransaction,
    removeTransaction,
    pushFloat,
    floats,
    dismissFloat,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

/* ============================ Helpers ============================ */

const formatAmount = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));

const formatGold = (n: number) => `${formatAmount(n)} ֏`;

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return d.toDateString();
};

const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Այսօր";
  if (d.toDateString() === yest.toDateString()) return "Երեկ";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

const timeLabel = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/* ============================ Root + Error Boundary ============================ */

interface BoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, info: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    // eslint-disable-next-line no-console
    console.error("[GoldKeeper] Top-level boundary caught:", error, info);
  }

  reset = () => this.setState({ error: null, info: null });

  reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const err = this.state.error;
    const stack = (err.stack || "").split("\n").slice(0, 6).join("\n");
    return (
      <div
        style={{
          minHeight: "100vh",
          background: COLORS.bg,
          color: COLORS.text,
          display: "flex",
          justifyContent: "center",
          padding: "32px 16px",
          fontFamily: "'Rajdhani', system-ui, sans-serif",
        }}
      >
        <div style={{ width: "100%", maxWidth: 430 }}>
          <Alert
            type="error"
            showIcon
            icon={<WarningFilled style={{ color: COLORS.danger }} />}
            message={
              <span
                className="gk-display"
                style={{ color: COLORS.danger, fontWeight: 800, letterSpacing: "0.06em" }}
              >
                ՀԵՐՈՍԸ ՊԱՐՏՎԵՑ
              </span>
            }
            description={
              <div style={{ color: COLORS.sub, fontSize: 13, lineHeight: 1.5 }}>
                Անսպասելի սխալ է տեղի ունեցել ինտերֆեյսում։ Քո Ոսկին ապահով է՝
                պահված տեղական հիշողության մեջ։ Փորձիր կրկին կամ վերաբեռնիր էջը։
              </div>
            }
            style={{
              background: "#1a0e10",
              border: `1px solid ${COLORS.danger}55`,
              borderRadius: 14,
            }}
          />
          <pre
            style={{
              marginTop: 14,
              padding: 12,
              background: "#0d0d11",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              fontSize: 11,
              color: COLORS.sub,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {err.name}: {err.message}
            {stack ? `\n\n${stack}` : ""}
          </pre>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Button block size="large" icon={<ReloadOutlined />} onClick={this.reset}>
              Վերսկսել
            </Button>
            <Button
              block
              size="large"
              type="primary"
              onClick={this.reload}
              style={{ background: COLORS.gold, color: "#141414", fontWeight: 800, border: "none" }}
            >
              Վերաբեռնել էջը
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

interface InlineErrorBannerProps {
  error: Error;
  onDismiss: () => void;
}

function InlineErrorBanner({ error, onDismiss }: InlineErrorBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{ padding: "0 16px", marginBottom: 10 }}
    >
      <Alert
        type="error"
        showIcon
        closable
        onClose={onDismiss}
        icon={<WarningFilled style={{ color: COLORS.danger }} />}
        message={
          <span style={{ color: COLORS.danger, fontWeight: 700, fontSize: 13 }}>
            Սխալ՝ {error.name}
          </span>
        }
        description={
          <span style={{ color: COLORS.sub, fontSize: 12 }}>{error.message}</span>
        }
        style={{
          background: "#1a0e10",
          border: `1px solid ${COLORS.danger}55`,
          borderRadius: 12,
        }}
      />
    </motion.div>
  );
}

interface RuntimeErrorCtx {
  reportError: (e: unknown) => void;
}
const RuntimeErrorContext = createContext<RuntimeErrorCtx | null>(null);
export const useRuntimeError = () => useContext(RuntimeErrorContext);

function GoldKeeperRoot() {
  return (
    <AppErrorBoundary>
      <GoldKeeperApp />
    </AppErrorBoundary>
  );
}

function GoldKeeperApp() {
  const [softError, setSoftError] = useState<Error | null>(null);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      setSoftError(e.error instanceof Error ? e.error : new Error(e.message || "Անհայտ սխալ"));
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      setSoftError(reason instanceof Error ? reason : new Error(String(reason ?? "Անհայտ սխալ")));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const reportError = useCallback((e: unknown) => {
    setSoftError(e instanceof Error ? e : new Error(String(e)));
  }, []);


  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: COLORS.gold,
          colorBgBase: COLORS.bg,
          colorBgContainer: COLORS.panel,
          colorBgElevated: COLORS.panel2,
          colorBorder: COLORS.border,
          colorText: COLORS.text,
          colorTextSecondary: COLORS.sub,
          fontFamily:
            "'Rajdhani', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          borderRadius: 12,
        },
        components: {
          Button: { controlHeight: 44, fontWeight: 600 },
          InputNumber: { controlHeight: 48 },
          Input: { controlHeight: 48 },
          Select: { controlHeight: 48 },
          Segmented: { itemSelectedBg: COLORS.gold, itemSelectedColor: "#141414" },
          Drawer: { colorBgElevated: COLORS.panel },
        },
      }}
    >
      <RuntimeErrorContext.Provider value={{ reportError }}>
        <VaultProvider>
          <StyleInjector />
          <BackdropFrame>
            <AnimatePresence>
              {softError && (
                <InlineErrorBanner
                  key="soft-error"
                  error={softError}
                  onDismiss={() => setSoftError(null)}
                />
              )}
            </AnimatePresence>
            <Dashboard />
          </BackdropFrame>
        </VaultProvider>
      </RuntimeErrorContext.Provider>
    </ConfigProvider>
  );
}

/* ============================ Styles ============================ */

function StyleInjector() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');
      html, body, #app { background: ${COLORS.bg}; }
      body { margin: 0; color: ${COLORS.text}; -webkit-font-smoothing: antialiased; }
      .gk-display { font-family: 'Orbitron', 'Rajdhani', sans-serif; letter-spacing: 0.02em; }
      .gk-glow-gold  { text-shadow: 0 0 10px ${COLORS.gold}66, 0 0 22px ${COLORS.gold}33; }
      .gk-glow-mana  { text-shadow: 0 0 10px ${COLORS.mana}66, 0 0 22px ${COLORS.mana}33; }
      .gk-glow-hp    { text-shadow: 0 0 10px ${COLORS.hp}66, 0 0 22px ${COLORS.hp}33; }
      .gk-glow-red   { text-shadow: 0 0 10px ${COLORS.danger}88, 0 0 22px ${COLORS.danger}55; }
      .gk-panel {
        background: linear-gradient(160deg, #1c1c22 0%, #15151a 100%);
        border: 1px solid ${COLORS.border};
        border-radius: 18px;
      }
      .gk-bar .ant-progress-inner { background: #0c0c10 !important; border: 1px solid ${COLORS.border}; }
      .gk-bar.gk-bar-mana .ant-progress-bg { background: linear-gradient(90deg, #0050b3, ${COLORS.mana}) !important; box-shadow: 0 0 12px ${COLORS.mana}88; }
      .gk-bar.gk-bar-hp .ant-progress-bg   { background: linear-gradient(90deg, #237804, ${COLORS.hp}) !important; box-shadow: 0 0 12px ${COLORS.hp}88; }
      .gk-bar.gk-bar-gold .ant-progress-bg { background: linear-gradient(90deg, #d48806, ${COLORS.gold}) !important; box-shadow: 0 0 14px ${COLORS.gold}99; }
      .gk-scan {
        position: absolute; inset: 0; pointer-events: none; border-radius: inherit; overflow: hidden;
      }
      .gk-scan::before {
        content: ""; position: absolute; left: -30%; top: -100%; width: 60%; height: 300%;
        background: linear-gradient(120deg, transparent, rgba(255,255,255,0.06), transparent);
        transform: rotate(20deg);
        animation: gk-shine 6s linear infinite;
      }
      @keyframes gk-shine { 0% { transform: translateX(-40%) rotate(20deg); } 100% { transform: translateX(220%) rotate(20deg); } }
      .gk-fab {
        background: linear-gradient(135deg, ${COLORS.gold}, #d48806) !important;
        color: #141414 !important; font-weight: 800 !important;
        box-shadow: 0 0 24px ${COLORS.gold}88, 0 8px 24px rgba(0,0,0,0.5) !important;
        border: none !important;
      }
      .gk-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.08em;
      }
      .gk-tx-row { border: 1px solid ${COLORS.border}; border-radius: 14px; background: #18181d; }
      .gk-tx-row:hover { border-color: #3a3a45; }
      .gk-divider-glow {
        height: 1px; background: linear-gradient(90deg, transparent, ${COLORS.border}, transparent); margin: 6px 0 10px;
      }
      .ant-drawer-header { background: ${COLORS.panel} !important; border-bottom: 1px solid ${COLORS.border} !important; }
      .ant-drawer-title { color: ${COLORS.gold} !important; font-family: 'Orbitron', sans-serif; letter-spacing: 0.06em; }
      .ant-drawer-content { background: ${COLORS.panel} !important; }
      .ant-segmented { background: #0d0d11 !important; }
      .ant-form-item-label > label { color: ${COLORS.sub} !important; text-transform: uppercase; font-size: 11px !important; letter-spacing: 0.12em; }
      .ant-select-selector, .ant-input-number, .ant-input-affix-wrapper, .ant-input {
        background: #0d0d11 !important; border-color: ${COLORS.border} !important;
      }
    `}</style>
  );
}

/* ============================ Frame ============================ */

function BackdropFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          `radial-gradient(1200px 600px at 50% -10%, #1a1a25 0%, ${COLORS.bg} 60%),` +
          `radial-gradient(800px 400px at 80% 110%, #1c1226 0%, transparent 60%),` +
          `radial-gradient(800px 400px at 20% 110%, #0b1f1d 0%, transparent 60%)`,
        display: "flex",
        justifyContent: "center",
        padding: "0",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          minHeight: "100vh",
          position: "relative",
          background: COLORS.bg,
          boxShadow: "0 0 60px rgba(0,0,0,0.6), inset 0 0 0 1px #1f1f27",
        }}
      >
        {children}
        <FloatLayer />
      </div>
    </div>
  );
}

/* ============================ Float Layer ============================ */

function FloatLayer() {
  const { floats, dismissFloat } = useVault();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <AnimatePresence>
        {floats.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 20, scale: 0.6 }}
            animate={{ opacity: 1, y: -120, scale: 1.15 }}
            exit={{ opacity: 0, y: -200, scale: 0.9 }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => dismissFloat(f.id)}
            style={{
              position: "absolute",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 900,
              fontSize: 44,
              letterSpacing: "0.04em",
              color:
                f.kind === "damage"
                  ? COLORS.danger
                  : f.kind === "heal"
                  ? COLORS.hp
                  : COLORS.transfer,
              textShadow:
                f.kind === "damage"
                  ? `0 0 18px ${COLORS.danger}, 0 0 36px ${COLORS.danger}99`
                  : f.kind === "heal"
                  ? `0 0 18px ${COLORS.hp}, 0 0 36px ${COLORS.hp}99`
                  : `0 0 18px ${COLORS.transfer}, 0 0 36px ${COLORS.transfer}99`,
            }}
          >
            {f.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ============================ Dashboard ============================ */

function Dashboard() {
  const v = useVault();
  const [open, setOpen] = useState(false);

  if (!v.ready) {
    return (
      <div style={{ padding: 24, color: COLORS.sub }}>
        <div className="gk-display" style={{ color: COLORS.gold, fontSize: 18 }}>
          Գանձարանը բեռնվում է...
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 8, background: "#1c1c22", borderRadius: 6, overflow: "hidden" }}>
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              style={{
                width: "40%",
                height: "100%",
                background: `linear-gradient(90deg, transparent, ${COLORS.gold}, transparent)`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 120 }}>
      <Header />
      <div style={{ padding: "0 16px" }}>
        <LevelCard />
        <div style={{ height: 14 }} />
        <WalletGrid />
        <div style={{ height: 22 }} />
        <QuestLog />
      </div>

      <motion.div
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.04 }}
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
        }}
      >
        <Button
          className="gk-fab"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => setOpen(true)}
          style={{ height: 56, borderRadius: 999, padding: "0 26px", fontSize: 16 }}
        >
          Նոր քվեստ գրանցել
        </Button>
      </motion.div>

      <TransactionDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/* ============================ Header ============================ */

function Header() {
  const { level } = useVault();
  return (
    <div
      style={{
        padding: "20px 16px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${COLORS.gold}, #d48806)`,
            display: "grid",
            placeItems: "center",
            color: "#141414",
            boxShadow: `0 0 18px ${COLORS.gold}66`,
          }}
        >
          <FireFilled style={{ fontSize: 20 }} />
        </div>
        <div>
          <div className="gk-display" style={{ fontSize: 16, color: COLORS.gold }}>
            GOLDKEEPER
          </div>
          <div style={{ fontSize: 10, color: COLORS.sub, letterSpacing: "0.18em" }}>
            ՖԻՆԱՆՍ · ՔՎԵՍՏ · ՄԱՏՅԱՆ
          </div>
        </div>
      </div>
      <Tag
        className="gk-display"
        style={{
          background: "#0d0d11",
          border: `1px solid ${COLORS.gold}55`,
          color: COLORS.gold,
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 12,
        }}
      >
        ՄԱԿ. {level}
      </Tag>
    </div>
  );
}

/* ============================ Level / Gold Card ============================ */

function LevelCard() {
  const { netWorth, level, levelProgress, goldIntoLevel, goldToNext } = useVault();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="gk-panel"
      style={{ position: "relative", padding: 18, overflow: "hidden" }}
    >
      <div className="gk-scan" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.sub, letterSpacing: "0.18em" }}>
            TOTAL GOLD
          </div>
          <div
            className="gk-display gk-glow-gold"
            style={{
              fontSize: 34,
              color: COLORS.gold,
              fontWeight: 800,
              marginTop: 4,
              lineHeight: 1.05,
            }}
          >
            {formatGold(netWorth)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: COLORS.sub, letterSpacing: "0.18em" }}>LEVEL</div>
          <div
            className="gk-display gk-glow-gold"
            style={{ fontSize: 32, color: COLORS.gold, fontWeight: 900 }}
          >
            <TrophyFilled style={{ marginRight: 8 }} />
            {level}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Progress
          percent={levelProgress}
          showInfo={false}
          strokeLinecap="butt"
          className="gk-bar gk-bar-gold"
          size={{ height: 12, width: undefined as unknown as number }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 11,
            color: COLORS.sub,
            letterSpacing: "0.08em",
          }}
        >
          <span>
            XP {formatAmount(goldIntoLevel)} / {formatAmount(LEVEL_UNIT)}
          </span>
          <span>{formatAmount(goldToNext)} ֏ to LVL {level + 1}</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ============================ Wallet Grid ============================ */

function WalletGrid() {
  const { cardBalance, cashBalance, netWorth } = useVault();
  const safe = (n: number) => (netWorth > 0 ? Math.max(0, Math.min(100, (n / netWorth) * 100)) : 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <WalletCard
        title="MANA"
        subtitle="Card Wallet"
        amount={cardBalance}
        color={COLORS.mana}
        glow="gk-glow-mana"
        barClass="gk-bar gk-bar-mana"
        icon={<ThunderboltFilled />}
        percent={safe(cardBalance)}
      />
      <WalletCard
        title="HEALTH"
        subtitle="Cash Wallet"
        amount={cashBalance}
        color={COLORS.hp}
        glow="gk-glow-hp"
        barClass="gk-bar gk-bar-hp"
        icon={<HeartFilled />}
        percent={safe(cashBalance)}
      />
    </div>
  );
}

function WalletCard(props: {
  title: string;
  subtitle: string;
  amount: number;
  color: string;
  glow: string;
  barClass: string;
  icon: React.ReactNode;
  percent: number;
}) {
  const negative = props.amount < 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="gk-panel"
      style={{ padding: 14, position: "relative", overflow: "hidden" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: props.color,
        }}
      >
        <span style={{ fontSize: 16 }}>{props.icon}</span>
        <span
          className="gk-display"
          style={{ fontSize: 12, letterSpacing: "0.16em", fontWeight: 700 }}
        >
          {props.title}
        </span>
      </div>
      <div
        className={`gk-display ${props.glow}`}
        style={{
          color: negative ? COLORS.danger : props.color,
          fontSize: 20,
          fontWeight: 800,
          marginTop: 6,
          lineHeight: 1.1,
        }}
      >
        {formatGold(props.amount)}
      </div>
      <div style={{ fontSize: 10, color: COLORS.sub, marginTop: 2, letterSpacing: "0.12em" }}>
        {props.subtitle.toUpperCase()}
      </div>
      <div style={{ marginTop: 10 }}>
        <Progress
          percent={props.percent}
          showInfo={false}
          strokeLinecap="butt"
          className={props.barClass}
          size={{ height: 8, width: undefined as unknown as number }}
        />
      </div>
    </motion.div>
  );
}

/* ============================ Quest Log ============================ */

function QuestLog() {
  const { transactions } = useVault();

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const key = dayKey(t.createdAt);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(
      (a, b) => (b[1][0]?.createdAt ?? 0) - (a[1][0]?.createdAt ?? 0),
    );
  }, [transactions]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          className="gk-display"
          style={{ color: COLORS.gold, fontSize: 13, letterSpacing: "0.18em" }}
        >
          QUEST LOG
        </div>
        <div style={{ fontSize: 11, color: COLORS.sub, letterSpacing: "0.12em" }}>
          {transactions.length} ENTRIES
        </div>
      </div>

      {transactions.length === 0 ? (
        <div
          className="gk-panel"
          style={{ padding: 28, textAlign: "center" }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: COLORS.sub }}>
                No quests logged yet. Begin your journey, hero.
              </span>
            }
          />
        </div>
      ) : (
        grouped.map(([key, items]) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "8px 2px 10px",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: COLORS.gold,
                  letterSpacing: "0.18em",
                  fontWeight: 700,
                }}
                className="gk-display"
              >
                {dayLabel(items[0].createdAt)}
              </span>
              <div className="gk-divider-glow" style={{ flex: 1 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AnimatePresence initial={false}>
                {items.map((t) => (
                  <TxRow key={t.id} tx={t} />
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const { removeTransaction } = useVault();
  const color =
    tx.type === "INCOME" ? COLORS.hp : tx.type === "EXPENSE" ? COLORS.danger : COLORS.transfer;
  const sign = tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "-" : "⇄";
  const label =
    tx.type === "TRANSFER"
      ? `${tx.wallet === "CARD" ? "Mana" : "HP"} → ${tx.toWallet === "CARD" ? "Mana" : "HP"}`
      : tx.wallet === "CARD"
      ? "Mana Wallet"
      : "HP Wallet";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10, height: 0, marginTop: 0 }}
      transition={{ duration: 0.25 }}
      className="gk-tx-row"
      style={{
        padding: "12px 12px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          background: `${color}1a`,
          color,
          fontSize: 16,
        }}
      >
        {tx.type === "INCOME" ? (
          <RiseOutlined />
        ) : tx.type === "EXPENSE" ? (
          <FallOutlined />
        ) : (
          <SwapOutlined />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: COLORS.text,
            fontWeight: 600,
            fontSize: 14,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {tx.type === "TRANSFER" ? "Wallet Transfer" : tx.category}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: COLORS.sub,
            marginTop: 2,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {timeLabel(tx.createdAt)} · {label}
          {tx.note ? ` · ${tx.note}` : ""}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          className="gk-display"
          style={{
            color,
            fontWeight: 800,
            fontSize: 14,
            whiteSpace: "nowrap",
          }}
        >
          {sign}
          {formatAmount(tx.amount)} ֏
        </span>
        <Popconfirm
          title="Undo this quest?"
          description="Balances will be recalculated."
          okText="Undo"
          cancelText="Keep"
          onConfirm={() => {
            removeTransaction(tx.id);
            message.success({ content: "Quest entry undone.", duration: 1.4 });
          }}
        >
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            style={{ color: COLORS.sub }}
          />
        </Popconfirm>
      </div>
    </motion.div>
  );
}

/* ============================ Drawer Form ============================ */

interface FormShape {
  type: TxType;
  amount: number;
  wallet: Wallet;
  toWallet?: Wallet;
  category: string;
  note?: string;
}

function TransactionDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addTransaction, cardBalance, cashBalance } = useVault();
  const [form] = Form.useForm<FormShape>();
  const [type, setType] = useState<TxType>("EXPENSE");
  const [wallet, setWallet] = useState<Wallet>("CARD");

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        type: "EXPENSE",
        wallet: "CARD",
        toWallet: "CASH",
        category: CATEGORIES.EXPENSE[0],
      });
      setType("EXPENSE");
      setWallet("CARD");
    }
  }, [open, form]);

  const onTypeChange = (val: TxType) => {
    setType(val);
    form.setFieldsValue({
      category: CATEGORIES[val][0],
      ...(val === "TRANSFER"
        ? { wallet: "CARD", toWallet: "CASH" }
        : {}),
    });
  };

  const onWalletChange = (val: Wallet) => {
    setWallet(val);
    if (type === "TRANSFER") {
      form.setFieldsValue({ toWallet: val === "CARD" ? "CASH" : "CARD" });
    }
  };

  const handleSubmit = (values: FormShape) => {
    const amount = Number(values.amount);
    if (!amount || amount <= 0) {
      message.error("Enter a valid amount, hero.");
      return;
    }
    if (values.type === "TRANSFER") {
      if (values.wallet === values.toWallet) {
        message.error("Source and destination wallets must differ.");
        return;
      }
      const src = values.wallet === "CARD" ? cardBalance : cashBalance;
      if (amount > src) {
        message.warning(
          `Insufficient ${values.wallet === "CARD" ? "Mana" : "HP"}. Available: ${formatGold(src)}`,
        );
      }
    }
    if (values.type === "EXPENSE") {
      const src = values.wallet === "CARD" ? cardBalance : cashBalance;
      if (amount > src) {
        message.warning(
          `Low ${values.wallet === "CARD" ? "Mana" : "HP"}: this drops below zero.`,
        );
      }
    }
    addTransaction({
      type: values.type,
      amount,
      wallet: values.wallet,
      toWallet: values.type === "TRANSFER" ? values.toWallet : undefined,
      category: values.type === "TRANSFER" ? "Wallet Transfer" : values.category,
      note: values.note?.trim() || undefined,
    });
    message.success({
      content:
        values.type === "INCOME"
          ? "Gold acquired!"
          : values.type === "EXPENSE"
          ? "Gold spent."
          : "Gold transferred.",
      duration: 1.4,
    });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="auto"
      closable
      title="NEW QUEST ENTRY"
      styles={{
        body: { background: COLORS.panel, paddingTop: 14 },
        wrapper: { maxWidth: 430, margin: "0 auto", borderRadius: "20px 20px 0 0", overflow: "hidden" },
      }}
    >
      <Form<FormShape>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          type: "EXPENSE",
          wallet: "CARD",
          toWallet: "CASH",
          category: CATEGORIES.EXPENSE[0],
        }}
      >
        <Form.Item name="type" label="Action">
          <Segmented
            block
            options={[
              { label: "Expense", value: "EXPENSE" },
              { label: "Income", value: "INCOME" },
              { label: "Transfer", value: "TRANSFER" },
            ]}
            onChange={(v) => onTypeChange(v as TxType)}
          />
        </Form.Item>

        <Form.Item
          name="amount"
          label="Gold Amount (֏)"
          rules={[{ required: true, message: "Amount required" }]}
        >
          <InputNumber
            min={1}
            step={100}
            size="large"
            style={{ width: "100%" }}
            placeholder="0"
            controls={false}
            stringMode={false}
            formatter={(v) => (v ? new Intl.NumberFormat("en-US").format(Number(v)) : "")}
            parser={(v) => Number((v || "").replace(/[^\d.]/g, "")) as unknown as 1}
          />
        </Form.Item>

        <Form.Item name="wallet" label={type === "TRANSFER" ? "From Wallet" : "Wallet"}>
          <Segmented
            block
            options={[
              { label: "Mana (Card)", value: "CARD" },
              { label: "HP (Cash)", value: "CASH" },
            ]}
            onChange={(v) => onWalletChange(v as Wallet)}
          />
        </Form.Item>

        {type === "TRANSFER" && (
          <Form.Item name="toWallet" label="To Wallet">
            <Segmented
              block
              options={[
                { label: "Mana (Card)", value: "CARD", disabled: wallet === "CARD" },
                { label: "HP (Cash)", value: "CASH", disabled: wallet === "CASH" },
              ]}
            />
          </Form.Item>
        )}

        {type !== "TRANSFER" && (
          <Form.Item name="category" label="Quest Type">
            <Select
              size="large"
              options={CATEGORIES[type].map((c) => ({ label: c, value: c }))}
            />
          </Form.Item>
        )}

        <Form.Item name="note" label="Scroll Note (optional)">
          <Input size="large" placeholder="e.g. Mana potion refill" maxLength={80} />
        </Form.Item>

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <Button block size="large" onClick={onClose}>
            Cancel
          </Button>
          <Button
            block
            size="large"
            htmlType="submit"
            style={{
              background:
                type === "INCOME"
                  ? `linear-gradient(135deg, ${COLORS.hp}, #237804)`
                  : type === "EXPENSE"
                  ? `linear-gradient(135deg, ${COLORS.danger}, #a8071a)`
                  : `linear-gradient(135deg, ${COLORS.transfer}, #531dab)`,
              color: "#fff",
              fontWeight: 800,
              border: "none",
              boxShadow:
                type === "INCOME"
                  ? `0 0 18px ${COLORS.hp}66`
                  : type === "EXPENSE"
                  ? `0 0 18px ${COLORS.danger}66`
                  : `0 0 18px ${COLORS.transfer}66`,
            }}
          >
            {type === "INCOME" ? "Claim Gold" : type === "EXPENSE" ? "Spend Gold" : "Transfer Gold"}
          </Button>
        </div>
      </Form>
    </Drawer>
  );
}
