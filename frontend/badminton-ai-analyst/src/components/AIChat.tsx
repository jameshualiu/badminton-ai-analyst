import { useState, useRef, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

const initialMessages: Message[] = [
    {
        id: "1",
        role: "assistant",
        content:
            "Hello! I'm your badminton AI analyst. I can help you understand your gameplay, analyze specific shots, identify patterns, and suggest improvements. What would you like to know?",
        timestamp: new Date(),
    },
];

export function AIChat() {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (!input.trim()) return;

        // Add user message
        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsTyping(true);

        // Simulate AI response
        setTimeout(() => {
            const responses = [
                "Based on your recent matches, I've noticed you tend to favor forehand smashes from the rear court. Your success rate is 87% when you're positioned at the back right corner. Consider incorporating more deceptive drop shots to keep your opponent guessing.",
                "Your footwork has improved significantly! The average time to reach the net has decreased by 0.3 seconds compared to last month. To further optimize, focus on your split-step timing right when your opponent makes contact.",
                "I've analyzed your shot placement patterns. You're hitting 65% of your shots to the opponent's backhand side, which is effective, but becoming predictable. Try mixing in more cross-court shots to open up the court.",
                "Great question! Your smash speed has peaked at 287 km/h, which is excellent. However, accuracy drops to 72% at maximum power. Consider reducing power by 10% to maintain 90%+ accuracy while still being aggressive.",
            ];

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content:
                    responses[Math.floor(Math.random() * responses.length)],
                timestamp: new Date(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
            setIsTyping(false);
        }, 1500);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-6 py-8 h-[calc(100vh-6rem)] flex flex-col">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-600 rounded-lg">
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <h2 className="text-3xl">AI Analyst</h2>
                </div>
                <p className="text-gray-400">
                    Ask me anything about your performance, technique, or
                    strategy
                </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto mb-6 space-y-4 pr-4 scrollbar-thin scrollbar-thumb-purple-900/50 scrollbar-track-transparent">
                <AnimatePresence initial={false}>
                    {messages.map((message) => (
                        <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className={`flex ${
                                message.role === "user"
                                    ? "justify-end"
                                    : "justify-start"
                            }`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl p-4 ${
                                    message.role === "user"
                                        ? "bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/30"
                                        : "bg-gradient-to-br from-purple-950/40 to-black border border-purple-900/20"
                                }`}
                            >
                                <p className="whitespace-pre-wrap">
                                    {message.content}
                                </p>
                                <p className="text-xs mt-2 opacity-60">
                                    {message.timestamp.toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isTyping && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                    >
                        <div className="bg-gradient-to-br from-purple-950/40 to-black border border-purple-900/20 rounded-2xl p-4">
                            <div className="flex gap-2">
                                <motion.div
                                    className="w-2 h-2 bg-purple-400 rounded-full"
                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 1,
                                        delay: 0,
                                    }}
                                />
                                <motion.div
                                    className="w-2 h-2 bg-purple-400 rounded-full"
                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 1,
                                        delay: 0.2,
                                    }}
                                />
                                <motion.div
                                    className="w-2 h-2 bg-purple-400 rounded-full"
                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 1,
                                        delay: 0.4,
                                    }}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-gradient-to-br from-purple-950/20 to-black border border-purple-900/20 rounded-2xl p-2 flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask about your performance..."
                    className="flex-1 bg-transparent px-4 py-3 outline-none text-white placeholder-gray-500"
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="px-6 py-3 bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-purple-500/50 hover:shadow-lg hover:shadow-purple-500/60 disabled:shadow-none"
                >
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                </button>
            </div>

            {/* Suggestions */}
            <div className="mt-4 flex flex-wrap gap-2">
                {[
                    "Analyze my serve placement",
                    "Compare to last week",
                    "Show my weak points",
                    "Improvement suggestions",
                ].map((suggestion) => (
                    <button
                        key={suggestion}
                        onClick={() => setInput(suggestion)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-purple-900/20 rounded-full text-sm text-gray-400 hover:text-white transition-all"
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
        </div>
    );
}
