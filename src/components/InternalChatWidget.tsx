import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  X, 
  Search, 
  User, 
  Clock, 
  Bell, 
  CheckCircle,
  AlertCircle,
  Hash,
  MessageCircle,
  Volume2,
  VolumeX,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './FirebaseProvider';

const PREDEFINED_CHANNELS = [
  { id: 'general', name: 'general', description: 'Canal general de la empresa' },
  { id: 'operaciones', name: 'operaciones', description: 'Discusión y estados de operaciones' },
  { id: 'finanzas', name: 'finanzas', description: 'Temas contables, facturas y pagos' },
  { id: 'inventario', name: 'inventario', description: 'Movimientos de stock e inventario' }
];

export default function InternalChatWidget() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'channels' | 'directs'>('channels');
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  
  // Selection
  const [activeChannelId, setActiveChannelId] = useState<string | null>('general');
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  
  const [newMessageText, setNewMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Real-time toast alert state
  const [latestToast, setLatestToast] = useState<{ 
    id: string; 
    senderName: string; 
    content: string; 
    senderId?: string;
    channelId?: string;
    isChannel: boolean;
  } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedMsgId = useRef<string | null>(null);

  // Local storage trackers for channel read history
  const [channelReadTimes, setChannelReadTimes] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('internal_chat_channel_reads');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Update last read time for the active channel or active direct chat
  useEffect(() => {
    if (activeChannelId) {
      const now = Date.now();
      const updated = { ...channelReadTimes, [activeChannelId]: now };
      setChannelReadTimes(updated);
      localStorage.setItem('internal_chat_channel_reads', JSON.stringify(updated));
    }
  }, [activeChannelId, isOpen, messages.length]);

  // Sound generator
  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5
      
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.warn("Could not produce audio notification:", e);
    }
  };

  // 1. Fetch system users
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'users')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeUsers = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter((u: any) => u.uid !== user.uid && !u.id.startsWith('invite_'));
      
      // Sort in memory by displayName or email safely
      activeUsers.sort((a: any, b: any) => {
        const nameA = (a.displayName || a.email || '').toLowerCase();
        const nameB = (b.displayName || b.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      setUsers(activeUsers);
    }, (error) => {
      console.error("Error fetching chat users:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Fetch both Direct messages AND Channel messages real-time
  useEffect(() => {
    if (!user) {
      setMessages([]);
      return;
    }

    const userId = user.uid;
    const directSentQuery = query(collection(db, 'internal_messages'), where('senderId', '==', userId), where('isGroup', '==', false));
    const directRecvQuery = query(collection(db, 'internal_messages'), where('receiverId', '==', userId), where('isGroup', '==', false));
    const groupQuery = query(collection(db, 'internal_messages'), where('isGroup', '==', true));

    let directSentDocs: any[] = [];
    let directRecvDocs: any[] = [];
    let groupDocs: any[] = [];

    const handleUpdates = () => {
      const allMessages = [...directSentDocs, ...directRecvDocs, ...groupDocs];
      // De-duplicate
      const uniqueMessages = Array.from(new Map(allMessages.map(m => [m.id, m])).values());
      // Sort chronologically ascending
      uniqueMessages.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      setMessages(uniqueMessages);
    };

    const unsubSent = onSnapshot(directSentQuery, (snapshot) => {
      directSentDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleUpdates();
    }, (err) => console.error("Snapshot error unsent:", err));

    const unsubRecv = onSnapshot(directRecvQuery, (snapshot) => {
      directRecvDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleUpdates();
    }, (err) => console.error("Snapshot error unrecv:", err));

    const unsubGroup = onSnapshot(groupQuery, (snapshot) => {
      groupDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleUpdates();
    }, (err) => console.error("Snapshot error ungroup:", err));

    return () => {
      unsubSent();
      unsubRecv();
      unsubGroup();
    };
  }, [user?.uid]);

  // 3. Process sound and toast alerts when new messages arrive
  useEffect(() => {
    if (!user || messages.length === 0) return;

    const latestMsg = messages[messages.length - 1];
    if (!latestMsg || latestMsg.senderId === user.uid) return;

    // Ensure we only alert on brand new messages added during this session
    if (latestMsg.id !== lastProcessedMsgId.current) {
      lastProcessedMsgId.current = latestMsg.id;

      const dateObj = latestMsg.createdAt?.seconds ? new Date(latestMsg.createdAt.seconds * 1000) : new Date(latestMsg.createdAt || 0);
      const diffMs = Date.now() - dateObj.getTime();
      
      // Only alert if the message was sent in the last 15 seconds (prevents alert storm on initial sync)
      if (diffMs < 15000) {
        if (latestMsg.isGroup) {
          // Channel message alert definition
          const isCurrentlyViewingThisChannel = isOpen && tab === 'channels' && activeChannelId === latestMsg.channelId;
          if (!isCurrentlyViewingThisChannel) {
            playAlertSound();
            setLatestToast({
              id: latestMsg.id,
              senderName: latestMsg.senderName || 'Colega',
              content: latestMsg.content,
              channelId: latestMsg.channelId,
              isChannel: true
            });
          }
        } else {
          // Direct 1-on-1 message alert definition
          const isCurrentlyViewingThisDirect = isOpen && tab === 'directs' && activeChatUserId === latestMsg.senderId;
          if (!isCurrentlyViewingThisDirect) {
            playAlertSound();
            setLatestToast({
              id: latestMsg.id,
              senderName: latestMsg.senderName || 'Colega',
              content: latestMsg.content,
              senderId: latestMsg.senderId,
              isChannel: false
            });
          }
        }
      }
    }
  }, [messages, user?.uid, activeChannelId, activeChatUserId, tab, isOpen, soundEnabled]);

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChannelId, activeChatUserId, tab]);

  // Mark direct messages from the active sender as read
  useEffect(() => {
    if (!user || !activeChatUserId || tab !== 'directs') return;
    
    const unreadFromActive = messages.filter(
      m => m.senderId === activeChatUserId && m.receiverId === user.uid && !m.read && !m.isGroup
    );

    unreadFromActive.forEach(msg => {
      updateDoc(doc(db, 'internal_messages', msg.id), { read: true }).catch(err => {
        console.error("Error setting message read state:", err);
      });
    });
  }, [messages, activeChatUserId, tab, user]);

  // Auto-dismiss latest toast alert
  useEffect(() => {
    if (!latestToast) return;
    const t = setTimeout(() => {
      setLatestToast(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [latestToast]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessageText.trim()) return;

    try {
      const cleanMsg = newMessageText.trim();
      setNewMessageText('');

      if (tab === 'channels' && activeChannelId) {
        // Post Group Channel Message
        await addDoc(collection(db, 'internal_messages'), {
          ownerId: user.uid,
          senderId: user.uid,
          senderEmail: user.email || '',
          senderName: profile?.displayName || user.displayName || 'Usuario',
          content: cleanMsg,
          isGroup: true,
          channelId: activeChannelId,
          createdAt: serverTimestamp()
        });
      } else if (tab === 'directs' && activeChatUserId) {
        // Post Private 1-on-1 Message
        const targetUser = users.find(u => u.uid === activeChatUserId);
        if (!targetUser) return;

        await addDoc(collection(db, 'internal_messages'), {
          ownerId: user.uid,
          senderId: user.uid,
          senderEmail: user.email || '',
          senderName: profile?.displayName || user.displayName || 'Usuario',
          receiverId: activeChatUserId,
          receiverEmail: targetUser.email || '',
          content: cleanMsg,
          isGroup: false,
          read: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error("Error sending communication message:", err);
    }
  };

  // Get active chat messages context
  const activeChatMessages = messages.filter(m => {
    if (tab === 'channels') {
      return m.isGroup && m.channelId === activeChannelId;
    } else {
      return !m.isGroup && (
        (m.senderId === user?.uid && m.receiverId === activeChatUserId) ||
        (m.senderId === activeChatUserId && m.receiverId === user?.uid)
      );
    }
  });

  // Calculate unreads
  const getDirectUnreadCount = (userId: string) => {
    return messages.filter(m => !m.isGroup && m.senderId === userId && m.receiverId === user?.uid && !m.read).length;
  };

  const getChannelUnreadCount = (channelId: string) => {
    const lastRead = channelReadTimes[channelId] || 0;
    return messages.filter(m => {
      if (!m.isGroup || m.channelId !== channelId || m.senderId === user?.uid) return false;
      const msgTime = m.createdAt?.seconds ? m.createdAt.seconds * 1000 : new Date(m.createdAt || 0).getTime();
      return msgTime > lastRead;
    }).length;
  };

  const totalDirectUnreads = messages.filter(m => !m.isGroup && m.receiverId === user?.uid && !m.read).length;
  
  const totalChannelUnreads = PREDEFINED_CHANNELS.reduce((sum, ch) => {
    return sum + getChannelUnreadCount(ch.id);
  }, 0);

  const totalUnreadCount = totalDirectUnreads + totalChannelUnreads;

  // Filters
  const filteredUsers = users.filter(u => {
    const name = (u.displayName || '').toLowerCase();
    const mail = (u.email || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || mail.includes(term);
  });

  const activeChatUser = users.find(u => u.uid === activeChatUserId);
  const activeChannel = PREDEFINED_CHANNELS.find(c => c.id === activeChannelId);

  return (
    <>
      {/* Real-time Toast alert - notification for new messages received while not actively viewing */}
      <AnimatePresence>
        {latestToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 right-6 z-[9999] bg-slate-900 text-white rounded-2xl p-4 shadow-2xl flex flex-col gap-2 border border-slate-750 max-w-sm w-full font-sans text-left"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-bold text-xs uppercase text-white shrink-0">
                  {latestToast.senderName.substring(0, 2)}
                </div>
                <div>
                  <span className="bg-primary/20 text-indigo-400 font-extrabold text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    {latestToast.isChannel ? `Canal #${latestToast.channelId}` : 'Chat Directo'}
                  </span>
                  <h4 className="font-bold text-xs text-white mt-1">Nuevo mensaje de {latestToast.senderName}</h4>
                </div>
              </div>
              <button 
                onClick={() => setLatestToast(null)}
                className="p-1 hover:bg-slate-800 rounded transition-colors cursor-pointer"
              >
                <X size={14} className="text-slate-400 hover:text-white" />
              </button>
            </div>
            
            <p className="text-xs text-slate-350 italic bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 line-clamp-2">
              "{latestToast.content}"
            </p>

            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-[10px] text-slate-550 flex items-center gap-1 font-semibold">
                <Bell size={10} className="text-primary animate-bounce" />
                Alerta en tiempo real
              </span>
              <button
                onClick={() => {
                  if (latestToast.isChannel) {
                    setTab('channels');
                    setActiveChannelId(latestToast.channelId || 'general');
                    setActiveChatUserId(null);
                  } else {
                    setTab('directs');
                    setActiveChatUserId(latestToast.senderId || null);
                    setActiveChannelId(null);
                  }
                  setIsOpen(true);
                  setLatestToast(null);
                }}
                className="px-3.5 py-1.5 bg-primary hover:bg-primary/95 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all cursor-pointer"
              >
                Ir al Chat
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher Button on page corner */}
      <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end">
        <motion.button
          onClick={() => {
            setIsOpen(prev => !prev);
            // Resume Audio Context on interaction
            if (!audioContextRef.current) {
              audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative w-14 h-14 rounded-full bg-slate-900 hover:bg-slate-850 text-white flex items-center justify-center shadow-2xl transition-all duration-300 border-2 border-white cursor-pointer group"
        >
          <MessageCircle size={22} className="group-hover:rotate-12 transition-transform duration-300" />
          {totalUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white px-1 shadow-md animate-pulse">
              {totalUnreadCount}
            </span>
          )}
        </motion.button>
      </div>

      {/* Slack-like Messenger Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 35, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 35, scale: 0.96 }}
            className="fixed bottom-24 right-6 z-[999] bg-white border border-slate-200 rounded-2xl shadow-2xl w-[400px] max-w-[95vw] h-[550px] flex flex-col overflow-hidden font-sans text-left"
          >
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight flex items-center gap-1.5">
                    Comunicación Corporativa
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-ping"></span>
                  </h3>
                  <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                    Canales Internos y Mensajes Directos
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSoundEnabled(p => !p)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white ${!soundEnabled && 'opacity-50'}`}
                  title={soundEnabled ? "Silenciar sonidos" : "Activar sonido"}
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white"
                  title="Ocultar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs (Canales vs Chats Directos) */}
            <div className="flex border-b border-slate-100 bg-slate-50 p-1">
              <button
                onClick={() => {
                  setTab('channels');
                  // Auto-select first channel if none is selected
                  if (!activeChannelId) setActiveChannelId('general');
                  setActiveChatUserId(null);
                }}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  tab === 'channels' 
                    ? 'bg-white text-primary shadow-sm ring-1 ring-slate-100' 
                    : 'text-slate-505 hover:bg-slate-100'
                }`}
              >
                <Hash size={14} />
                Canales
                {totalChannelUnreads > 0 && (
                  <span className="inline-block bg-primary text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                    {totalChannelUnreads}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setTab('directs');
                  setActiveChannelId(null);
                }}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  tab === 'directs' 
                    ? 'bg-white text-primary shadow-sm ring-1 ring-slate-100' 
                    : 'text-slate-505 hover:bg-slate-100'
                }`}
              >
                <Users size={14} />
                Colegas (Directo)
                {totalDirectUnreads > 0 && (
                  <span className="inline-block bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                    {totalDirectUnreads}
                  </span>
                )}
              </button>
            </div>

            {/* Main body split/toggle */}
            <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
              
              {((tab === 'channels' && !activeChannelId) || (tab === 'directs' && !activeChatUserId)) ? (
                
                <div className="flex-1 flex flex-col overflow-hidden p-3 gap-2">
                  <div className="relative mb-2 shrink-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={tab === 'channels' ? 'Filtrar canales...' : 'Buscar colega por nombre o email...'}
                      className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 p-0.5 custom-scrollbar">
                    {tab === 'channels' ? (
                      PREDEFINED_CHANNELS
                        .filter(c => c.name.includes(searchTerm.toLowerCase()))
                        .map(ch => {
                          const unreads = getChannelUnreadCount(ch.id);
                          return (
                            <button
                              key={ch.id}
                              onClick={() => {
                                setActiveChannelId(ch.id);
                                setActiveChatUserId(null);
                              }}
                              className="w-full flex items-center justify-between p-3 bg-white hover:bg-indigo-50/50 rounded-xl transition-all border border-slate-100 shadow-sm text-left cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                  <Hash size={16} className="font-bold" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-xs text-slate-900 leading-none flex items-center gap-1.5">
                                    #{ch.name}
                                    {unreads > 0 && <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-1 leading-none truncate">
                                    {ch.description}
                                  </p>
                                </div>
                              </div>
                              {unreads > 0 && (
                                <span className="bg-primary text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded-full shrink-0">
                                  {unreads}
                                </span>
                              )}
                            </button>
                          );
                        })
                    ) : (
                      filteredUsers.length > 0 ? (
                        filteredUsers.map((u) => {
                          const unread = getDirectUnreadCount(u.uid);
                          return (
                            <button
                              key={u.uid}
                              onClick={() => {
                                setActiveChatUserId(u.uid);
                                setActiveChannelId(null);
                              }}
                              className="w-full flex items-center justify-between p-3 bg-white hover:bg-rose-50/20 rounded-xl transition-all border border-slate-100 shadow-sm text-left cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-100 flex items-center justify-center font-bold text-slate-600 shrink-0 text-xs">
                                  {u.displayName ? u.displayName.substring(0, 2).toUpperCase() : u.email.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-xs text-slate-900 group-hover:text-primary transition-colors leading-none truncate">
                                    {u.displayName || 'Colega'}
                                    <span className="ml-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-1 leading-none truncate">
                                    {u.email}
                                  </p>
                                </div>
                              </div>
                              {unread > 0 ? (
                                <span className="bg-rose-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full min-w-[14px] text-center shrink-0">
                                  {unread}
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 scale-90">Activo</span>
                              )}
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center text-slate-400">
                          <p className="text-xs font-semibold">No se encontraron colegas</p>
                          <p className="text-[10px] text-slate-350 mt-1">Los usuarios registrados aparecerán aquí.</p>
                        </div>
                      )
                    )}
                  </div>
                </div>

              ) : (

                // ACTIVE CHAT STREAM (Direct OR Channel)
                <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                  
                  {/* Chat Sub-Header */}
                  <div className="px-4 py-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button 
                        onClick={() => {
                          setActiveChannelId(null);
                          setActiveChatUserId(null);
                        }}
                        className="px-2 py-1 bg-slate-120 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors font-bold text-[10px] cursor-pointer"
                        title="Ver lista completa"
                      >
                        ← Atrás
                      </button>
                      
                      {tab === 'channels' ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Hash size={16} className="text-primary font-black shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs flex items-center gap-1">
                              #{activeChannel?.name}
                            </p>
                            <p className="text-[9px] text-slate-400 leading-none truncate">
                              {activeChannel?.description}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary font-sans uppercase shrink-0 text-xs">
                            {activeChatUser?.displayName ? activeChatUser.displayName.substring(0, 2) : activeChatUser?.email?.substring(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-sans font-bold text-slate-950 text-xs truncate leading-none">
                              {activeChatUser?.displayName || 'Chat Privado'}
                            </p>
                            <p className="text-[9px] text-slate-400 leading-none mt-1 truncate">
                              {activeChatUser?.email}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Messages Stream list */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {activeChatMessages.length > 0 ? (
                      activeChatMessages.map((msg) => {
                        const isMe = msg.senderId === user?.uid;
                        const dateObj = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000) : new Date(msg.createdAt || 0);
                        const formattedTime = dateObj.toLocaleTimeString('es-CL', {
                          hour: '2-digit',
                          minute: '2-digit'
                        });

                        return (
                          <div 
                            key={msg.id}
                            className={`flex flex-col max-w-[85%] ${isMe ? 'ml-auto items-end animate-fade-in' : 'mr-auto items-start animate-fade-in-left'}`}
                          >
                            {!isMe && tab === 'channels' && (
                              <span className="text-[9px] font-bold text-slate-504 pl-1 mb-0.5 select-none">
                                {msg.senderName}
                              </span>
                            )}
                            <div className={`p-3 rounded-2xl shadow-xs border text-xs leading-relaxed font-sans whitespace-pre-line ${
                              isMe 
                                ? 'bg-indigo-600 text-white border-indigo-700 rounded-tr-none font-medium' 
                                : 'bg-white text-slate-800 border-slate-200/80 rounded-tl-none font-medium'
                            }`}>
                              <p>{msg.content}</p>
                            </div>
                            <span className="text-[8px] font-mono text-slate-400/80 mt-1 leading-none font-semibold flex items-center gap-1.5 select-none">
                              {formattedTime}
                              {isMe && !msg.isGroup && (
                                <span className={msg.read ? 'text-primary' : 'text-slate-350'}>
                                  {msg.read ? '✔ leido' : '✔ enviado'}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6">
                        <MessageSquare size={32} className="text-slate-300/80 mb-2" />
                        <p className="text-xs font-bold text-slate-400">
                          {tab === 'channels' 
                            ? `Este es el comienzo del canal #${activeChannel?.name}`
                            : `Conversación privada con ${activeChatUser?.displayName || 'colega'}`
                          }
                        </p>
                        <p className="text-[10px] text-slate-350 mt-1">
                          Envía un mensaje para comenzar la comunicación grupal.
                        </p>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input form footer */}
                  <form 
                    onSubmit={handleSendMessage}
                    className="p-3 bg-white border-t border-slate-200/60 flex gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                      placeholder={tab === 'channels' ? `Escribir en #${activeChannel?.name}...` : `Escribir a ${activeChatUser?.displayName || 'colega'}...`}
                      className="flex-1 h-9.5 px-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all font-sans font-medium bg-slate-50"
                    />
                    <button
                      type="submit"
                      disabled={!newMessageText.trim()}
                      className="h-9.5 w-9.5 bg-primary hover:bg-primary-dark text-white rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 cursor-pointer shadow-xs active:scale-95"
                    >
                      <Send size={15} />
                    </button>
                  </form>

                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
