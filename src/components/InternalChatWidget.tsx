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
  AlertCircle
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

export default function InternalChatWidget() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [newMessageText, setNewMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Real-time toast alert state
  const [latestToast, setLatestToast] = useState<{ id: string; senderName: string; content: string; senderId: string } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedMsgId = useRef<string | null>(null);

  // Sound generator
  const playAlertSound = () => {
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
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);  // A5
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("Could not produce audio notification:", e);
    }
  };

  // 1. Fetch system users
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'users'),
      orderBy('displayName', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeUsers = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter((u: any) => u.uid !== user.uid && u.accessStatus === 'approved');
      setUsers(activeUsers);
    }, (error) => {
      console.error("Error fetching chat users:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Fetch all messages involving the current user (sent or received)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'internal_messages'),
      where('ownerId', '==', user.uid) // Wait! In firestore.rules, we allowed read/write if senderId == uid OR receiverId == uid.
    );

    // Let's create two separate observers or filter inside, or query all. Wait! Since firestore.rules limits listing,
    // let's read messages. Is there any ownerId that binds it, or can we just query where receiverId == user.uid and senderId == user.uid?
    // Let's create a combined snapshot or just query without ownerId constraints if firestore.rules does not strictly mandate ownerId on /internal_messages!
    // Let's verify firestore.rules for match /internal_messages/{messageId}:
    // `allow read, list, update, delete: if isApproved() && (resource.data.senderId == request.auth.uid || resource.data.receiverId == request.auth.uid || isAdmin());`
    // YES! There is NO ownerId equality check in `/internal_messages` list permissions! BOTH receiver or sender can query.
    // However, to make a simple, clean Firestore query for list that matches rules, we can fetch all documents in client or run simple queries.
    // Wait, in Firestore, if a user queries a collection, the query MUST match the rules. 
    // If the rule allows lists when (senderId == uid OR receiverId == uid), a query for ALL messages in `collection(db, 'internal_messages')` will fail!
    // To list safely, we can subscribe to two targeted queries:
    // Query 1: where senderId == uid
    // Query 2: where receiverId == uid
    // This is a standard Firestore pattern that is guaranteed to prevent "Missing or insufficient permissions"!
    
    const senderQuery = query(collection(db, 'internal_messages'), where('senderId', '==', user.uid));
    const receiverQuery = query(collection(db, 'internal_messages'), where('receiverId', '==', user.uid));

    let senderDocs: any[] = [];
    let receiverDocs: any[] = [];

    const handleUpdates = () => {
      const allMessages = [...senderDocs, ...receiverDocs];
      // De-duplicate by ID
      const uniqueMessages = Array.from(new Map(allMessages.map(m => [m.id, m])).values());
      // Sort in-memory descending or ascending? Let's sort ascending by createdAt for chronological chat
      uniqueMessages.sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      setMessages(uniqueMessages);

      // Check for real-time alerts on incoming unread messages!
      const unreadIncoming = uniqueMessages.filter(m => m.receiverId === user.uid && !m.read);
      if (unreadIncoming.length > 0) {
        const latestUnread = unreadIncoming[unreadIncoming.length - 1];
        
        // Trigger alert only if it's a new message ID we haven't processed yet during this session
        if (latestUnread.id !== lastProcessedMsgId.current) {
          lastProcessedMsgId.current = latestUnread.id;
          
          // Sound and alert popup only if current sender chat isn't already active/open
          if (activeChatUserId !== latestUnread.senderId || !isOpen) {
            playAlertSound();
            setLatestToast({
              id: latestUnread.id,
              senderName: latestUnread.senderName || 'Usuario',
              content: latestUnread.content,
              senderId: latestUnread.senderId
            });
          } else {
            // If the chat with this user is open, immediately mark as read!
            updateDoc(doc(db, 'internal_messages', latestUnread.id), { read: true });
          }
        }
      }
    };

    const unsubSender = onSnapshot(senderQuery, (snapshot) => {
      senderDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleUpdates();
    }, (err) => console.error("Sender message snapshot error:", err));

    const unsubReceiver = onSnapshot(receiverQuery, (snapshot) => {
      receiverDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleUpdates();
    }, (err) => console.error("Receiver message snapshot error:", err));

    return () => {
      unsubSender();
      unsubReceiver();
    };
  }, [user, activeChatUserId, isOpen]);

  // Scroll to bottom when messages or active chat changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChatUserId]);

  // Mark active chat messages as read
  useEffect(() => {
    if (!user || !activeChatUserId) return;
    
    const unreadFromActive = messages.filter(
      m => m.senderId === activeChatUserId && m.receiverId === user.uid && !m.read
    );

    unreadFromActive.forEach(msg => {
      updateDoc(doc(db, 'internal_messages', msg.id), { read: true }).catch(err => {
        console.error("Error setting message read:", err);
      });
    });
  }, [messages, activeChatUserId, user]);

  // Auto-dismiss latest toast after 6 seconds
  useEffect(() => {
    if (!latestToast) return;
    const t = setTimeout(() => {
      setLatestToast(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [latestToast]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeChatUserId || !newMessageText.trim()) return;

    const targetUser = users.find(u => u.uid === activeChatUserId);
    if (!targetUser) return;

    try {
      const cleanMsg = newMessageText.trim();
      setNewMessageText('');
      
      await addDoc(collection(db, 'internal_messages'), {
        ownerId: user.uid, // Add security scope
        senderId: user.uid,
        senderEmail: user.email || '',
        senderName: profile?.displayName || user.displayName || 'Usuario',
        receiverId: activeChatUserId,
        receiverEmail: targetUser.email || '',
        content: cleanMsg,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // Get active chat's messages
  const activeChatMessages = messages.filter(
    m => (m.senderId === user?.uid && m.receiverId === activeChatUserId) ||
         (m.senderId === activeChatUserId && m.receiverId === user?.uid)
  );

  // Compute unread messages counts per user
  const getUnreadCount = (userId: string) => {
    return messages.filter(m => m.senderId === userId && m.receiverId === user?.uid && !m.read).length;
  };

  const totalUnreadCount = messages.filter(m => m.receiverId === user?.uid && !m.read).length;

  // Filter users by search term
  const filteredUsers = users.filter(u => {
    const name = (u.displayName || '').toLowerCase();
    const mail = (u.email || '').toLowerCase();
    const term = searchTerm.toLowerCase();
    return name.includes(term) || mail.includes(term);
  });

  const activeChatUser = users.find(u => u.uid === activeChatUserId);

  return (
    <>
      {/* Real-time incoming unread Toast Popup */}
      <AnimatePresence>
        {latestToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 right-6 z-[9999] bg-slate-900 text-white rounded-2xl p-4 shadow-2xl flex flex-col gap-2 border border-slate-700 max-w-sm w-full font-sans text-left"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs uppercase animate-pulse">
                  {latestToast.senderName.substring(0, 2)}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-100">Nuevo Mensaje Interno</h4>
                  <p className="text-[10px] text-slate-400 font-semibold">{latestToast.senderName}</p>
                </div>
              </div>
              <button 
                onClick={() => setLatestToast(null)}
                className="p-1 hover:bg-slate-800 rounded transition-colors"
              >
                <X size={14} className="text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-300 font-medium line-clamp-2 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              "{latestToast.content}"
            </p>
            <div className="flex items-center justify-end gap-2 mt-1">
              <button
                onClick={() => {
                  setActiveChatUserId(latestToast.senderId);
                  setIsOpen(true);
                  setLatestToast(null);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold text-white transition-colors cursor-pointer"
              >
                Responder Chat
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Messenger Icon Button */}
      <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end">
        <motion.button
          onClick={() => setIsOpen(prev => !prev)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl hover:bg-primary-dark transition-all duration-200 border-2 border-white cursor-pointer"
        >
          {isOpen ? <X size={20} /> : <MessageSquare size={20} />}
          {totalUnreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white px-1">
              {totalUnreadCount}
            </span>
          )}
        </motion.button>
      </div>

      {/* Large Sidebar/Widget Messenger UI */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-20 right-6 z-[999] bg-white border border-slate-200 rounded-2xl shadow-2xl w-96 max-w-full h-[500px] flex flex-col overflow-hidden font-sans text-left"
          >
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
                  <MessageSquare size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight leading-none">Comunicación Interna</h3>
                  <span className="text-[10px] text-slate-400 mt-0.5 inline-block font-medium">Bandeja de Entrada Privada</span>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Minimizar panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Switcher: Contact List OR Chat Window */}
            {activeChatUserId === null ? (
              // CONTACT LIST
              <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                {/* Search Bar */}
                <div className="p-3 bg-white border-b border-slate-100">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar colega por nombre o email..."
                      className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                    />
                  </div>
                </div>

                {/* User List scroll container */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => {
                      const unread = getUnreadCount(u.uid);
                      return (
                        <button
                          key={u.uid}
                          onClick={() => setActiveChatUserId(u.uid)}
                          className="w-full flex items-center justify-between p-2.5 bg-white hover:bg-indigo-50/50 rounded-xl transition-all border border-slate-100 shadow-sm text-left group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 font-bold text-slate-600 shrink-0 text-xs">
                              {u.displayName ? u.displayName.substring(0, 2).toUpperCase() : u.email.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-slate-900 group-hover:text-primary transition-colors leading-none truncate">
                                {u.displayName || 'Usuario'}
                              </p>
                              <p className="text-[10px] text-slate-450 mt-1 leading-none truncate">
                                {u.email}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {unread > 0 ? (
                              <span className="bg-rose-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full min-w-[14px] text-center">
                                {unread}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-350 tracking-wide font-mono flex items-center gap-0.5">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      <p className="text-xs font-semibold">No se encontraron otros usuarios</p>
                      <p className="text-[10px] text-slate-400 mt-1">Invita usuarios desde el módulo de "Usuarios".</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // ACTIVE CHAT WINDOW
              <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                {/* Active Chat Header */}
                <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <button 
                      onClick={() => setActiveChatUserId(null)}
                      className="p-1 hover:bg-slate-150 rounded transition-colors text-slate-400 hover:text-slate-700 cursor-pointer font-bold text-xs"
                    >
                      ← Volver
                    </button>
                    <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 font-sans uppercase shrink-0">
                      {activeChatUser?.displayName ? activeChatUser.displayName.substring(0, 2) : activeChatUser?.email?.substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 leading-none truncate text-xs">
                        {activeChatUser?.displayName || 'Chat Privado'}
                      </p>
                      <p className="text-[9px] text-slate-450 mt-1 leading-none truncate font-medium">
                        {activeChatUser?.email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Messages Feed area */}
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
                          className={`flex flex-col max-w-[80%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                        >
                          <div className={`p-3 rounded-2xl shadow-sm border text-xs leading-relaxed font-sans font-medium whitespace-pre-line ${
                            isMe 
                              ? 'bg-primary text-white border-primary-dark rounded-br-none' 
                              : 'bg-white text-slate-800 border-slate-200 rounded-bl-none'
                          }`}>
                            <p>{msg.content}</p>
                          </div>
                          <span className="text-[8px] font-mono text-slate-400 mt-1 flex items-center gap-1 font-bold">
                            {formattedTime}
                            {isMe && (
                              <span className={msg.read ? 'text-primary' : 'text-slate-350'}>
                                {msg.read ? '(leído)' : '(enviado)'}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6">
                      <MessageSquare size={30} className="text-slate-200 mb-2" />
                      <p className="text-xs font-semibold text-slate-400">Comienza a chatear con {activeChatUser?.displayName || 'colega'}</p>
                      <p className="text-[10px] text-slate-350 mt-1">Escribe tu primer mensaje abajo.</p>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Send message form */}
                <form 
                  onSubmit={handleSendMessage}
                  className="p-3 bg-white border-t border-slate-200 flex gap-2"
                >
                  <input
                    type="text"
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 h-9 px-3 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-sans font-medium bg-slate-50"
                  />
                  <button
                    type="submit"
                    disabled={!newMessageText.trim()}
                    className="h-9 w-9 bg-primary hover:bg-primary-dark text-white rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
