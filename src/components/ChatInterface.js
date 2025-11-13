"use client";

import Vapi from "@vapi-ai/web";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Waveform from "./Waveform";
import SoundWaveform from "./SoundWaveForm";

export default function ChatInterface() {
  const router = useRouter();
  const [isMicOn, setIsMicOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState("inactive");
  const [isMuted, setIsMuted] = useState(false);
  const [vapi, setVapi] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [callId, setCallId] = useState(null);
  const [messageIdCounter, setMessageIdCounter] = useState(2);
  const [currentAssistant, setCurrentAssistant] = useState(null); // Track which assistant is active

  const generateMessageId = () => {
    const newId = messageIdCounter;
    setMessageIdCounter((prev) => prev + 1);
    return newId;
  };

  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Welcome to the M-CHAT-R screening assessment. I'm here to help evaluate your child's development through a few simple questions. You can speak using the microphone or type your responses.",
      timestamp: new Date(),
      type: "ai",
    },
  ]);

  const [childName, setChildName] = useState("");

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const messagesContainer = document.getElementById("messages-container");
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, [messages]);

  // Load child name from localStorage
  useEffect(() => {
    const storedName = localStorage.getItem("childName");
    if (storedName) {
      setChildName(storedName);
    }
  }, []);

  // Initialize VAPI
  useEffect(() => {
    const vapiInstance = new Vapi("5414e0b9-021c-4c09-83f5-10a46f23ecef");
    setVapi(vapiInstance);

    // Set up event listeners
    vapiInstance.on("call-start", () => {
      console.log("Call started");
      setIsMicOn(true);
      setCallStatus("active");
      setIsConnecting(false);
      setIsMuted(false);
      addMessage("📞 Assessment session started", "system");
    });

    vapiInstance.on("call-end", () => {
      console.log("Call ended");
      setIsMicOn(false);
      setCallStatus("ended");
      setIsConnecting(false);
      addMessage("📞 Assessment session ended", "system");
    });

    vapiInstance.on("speech-start", () => {
      console.log("User started speaking");
      addMessage("speaking", "ai");
    });

    vapiInstance.on("speech-end", () => {
      console.log("User stopped speaking");
    });

    // Listen for assistant transfers (language switching)
    vapiInstance.on("message", (message) => {
      console.log("Message from assistant:", message);

      // Log ALL message types to see what's happening
      console.log("Message type:", message.type);

      // Check for handoff attempts
      if (message.type === "function-call" || message.type === "tool-calls") {
        console.log("🔧 Function/Tool called:", message);
      }

      // Check for transfer messages
      if (message.type === "assistant-request" || message.type === "transfer") {
        console.log("🔄 Transfer requested:", message);
      }

      // Handle assistant transfers
      if (message.type === "assistant-request") {
        console.log("Assistant transfer requested:", message);
        const assistantName =
          message.destination?.assistant?.name || "assistant";
        addMessage(`🔄 Switching to ${assistantName}...`, "system");
      }

      // Track current assistant
      if (
        message.type === "assistant-request" &&
        message.destination?.assistant
      ) {
        setCurrentAssistant(message.destination.assistant);
        console.log("Current assistant:", message.destination.assistant.name);
      }

      // Handle final user speech
      if (
        message.type === "transcript" &&
        message.transcriptType === "final" &&
        message.role === "user"
      ) {
        updateLastMessage(message.transcript, "user");
        return;
      }

      // Handle final assistant speech
      if (
        message.type === "transcript" &&
        message.transcriptType === "final" &&
        message.role === "assistant"
      ) {
        updateLastAIMessage(message.transcript);

        // Detect closing phrase
        if (message.transcript.toLowerCase().includes("assessment completed")) {
          addMessage(
            "✅ The assessment is now complete. Thank you for your participation!",
            "system"
          );

          setTimeout(() => {
            vapiInstance.stop();
            setCallStatus("ended");
            setIsMicOn(false);
            setIsConnecting(false);
          }, 2000);
        }
      }
    });

    vapiInstance.on("error", (error) => {
      console.error("VAPI Error:", error);
      setIsConnecting(false);
      setIsMicOn(false);
      setCallStatus("inactive");

      let errorMessage = "Connection failed";
      if (error.type === "start-method-error") {
        errorMessage =
          "Failed to start call. Please check your VAPI configuration.";
      } else if (error.error && error.error.message) {
        errorMessage = error.error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      addMessage(`❌ Error: ${errorMessage}`, "error");
    });

    // Cleanup on unmount
    return () => {
      if (vapiInstance) {
        vapiInstance.stop();
      }
    };
  }, []);

  // Navigate to summary when call ends
  useEffect(() => {
    console.log(
      "Navigation effect triggered - callStatus:",
      callStatus,
      "callId:",
      callId
    );
    if (callStatus === "ended" && callId) {
      console.log(
        "Navigation conditions met - callStatus:",
        callStatus,
        "callId:",
        callId
      );
      const timer = setTimeout(() => {
        console.log("Navigating to summary page with call ID:", callId);
        router.push(`/chat/summary/${callId}`);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [callStatus, callId, router]);

  const addMessage = (text, type) => {
    const newMessage = {
      id: generateMessageId(),
      text,
      timestamp: new Date(),
      type,
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const updateLastMessage = (text, type) => {
    setMessages((prev) => {
      const messages = [...prev];
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage &&
        lastMessage.type === type &&
        lastMessage.text.includes("speaking...")
      ) {
        messages[messages.length - 1] = {
          ...lastMessage,
          text,
          timestamp: new Date(),
        };
      } else {
        messages.push({
          id: generateMessageId(),
          text,
          timestamp: new Date(),
          type,
        });
      }
      return messages;
    });
  };

  const updateLastAIMessage = (text) => {
    setMessages((prev) => {
      const messages = [...prev];

      // Remove all AI messages that contain "speaking"
      const filteredMessages = messages.filter(
        (message) =>
          !(message.type === "ai" && message.text.includes("speaking"))
      );

      // Add the new AI message with the actual transcript
      filteredMessages.push({
        id: generateMessageId(),
        text: text,
        timestamp: new Date(),
        type: "ai",
      });

      return filteredMessages;
    });
  };

  // ============================================
  // 🎯 SIMPLIFIED: Start call with Squad
  // ============================================
  const startCall = async () => {
    if (!vapi) return;

    setIsConnecting(true);
    setCallStatus("connecting");

    try {
      // Start with the English/Hindi assistant (squad start member)
      const ENGLISH_ASSISTANT_ID = "02311fd6-4974-47a3-a03b-930e0110f73d";

      console.log("Starting call with English/Hindi assistant");

      const callResponse = await vapi.start(ENGLISH_ASSISTANT_ID);

      console.log("Call started:", callResponse);

      if (callResponse && callResponse.id) {
        setCallId(callResponse.id);
      }
    } catch (error) {
      console.error("Failed to start call:", error);
      setIsConnecting(false);
      setCallStatus("inactive");
      addMessage(`❌ Error: ${error.message || "Connection failed"}`, "error");
    }
  };

  const endCall = () => {
    if (vapi && (callStatus === "active" || callStatus === "connecting")) {
      vapi.stop();
      setCallStatus("ended");
      setIsMicOn(false);
      setIsConnecting(false);
    }
  };

  // Function to send text input to assistant
  const sendTextToAssistant = async (text) => {
    if (!vapi || !text.trim()) return;

    try {
      // Add user message to chat
      addMessage(text, "user");

      // Send text input to VAPI
      await vapi.send({
        type: "add-message",
        message: {
          role: "user",
          content: text,
        },
      });

      console.log("Text sent to assistant:", text);
    } catch (error) {
      console.error("Failed to send text to assistant:", error);
      addMessage(`❌ Failed to send message: ${error.message}`, "error");
    }
  };

  // Handle text input form submission
  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textInput.trim()) {
      if (callStatus !== "active") {
        // Start call if not active
        startCall().then(() => {
          sendTextToAssistant(textInput.trim());
        });
      } else {
        sendTextToAssistant(textInput.trim());
      }
      setTextInput("");
    }
  };

  // Handle microphone toggle
  const handleMicToggle = () => {
    if (callStatus === "inactive") {
      startCall();
    } else if (callStatus === "active") {
      endCall();
    }
  };

  // Handle mute toggle
  const handleMuteToggle = () => {
    if (vapi && callStatus === "active") {
      const newMutedState = !isMuted;
      vapi.setMuted(newMutedState);
      setIsMuted(newMutedState);
      console.log(`Microphone ${newMutedState ? "muted" : "unmuted"}`);
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case "connecting":
        return "Connecting...";
      case "active":
        return "In Call";
      case "ended":
        return "Call Ended";
      default:
        return "Ready to Call";
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case "connecting":
        return "text-yellow-600";
      case "active":
        return "text-green-600";
      case "ended":
        return "text-gray-600";
      default:
        return "text-blue-600";
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br bg-white flex items-center justify-center relative">
      {/* Main Assessment Interface */}
      <div className="rounded-2xl w-full h-full overflow-hidden pb-24">
        {/* Messages Area */}
        <div
          id="messages-container"
          className="h-full w-[95%] mx-auto alliance overflow-y-auto scroll-smooth"
        >
          <div className="p-6 space-y-6 pb-52">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.type === "ai" ||
                  message.type === "system" ||
                  message.type === "error"
                    ? "justify-start"
                    : "justify-end"
                }`}
              >
                <div
                  className={`flex flex-col max-w-xs lg:max-w-2xl ${
                    message.type === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="relative px-6 py-4 rounded-2xl transition-all duration-300 flex items-start gap-4">
                    {/* Avatar for AI messages */}
                    {message.type === "ai" && (
                      <div className="flex-shrink-0">
                        <img
                          src="/female.svg"
                          alt="AI Assistant"
                          className="w-11 h-11 rounded-full"
                        />
                      </div>
                    )}

                    {/* Message Content */}
                    <div className="flex-1">
                      {message.text === "speaking" ? (
                        <div className="flex items-center space-x-2">
                          <SoundWaveform />
                        </div>
                      ) : (
                        <p className="text-[#222836] alliance text-[28px] font-normal leading-[40px] tracking-[-0.56px]">
                          {message.text}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Timestamp */}
                  <span className="text-xs text-gray-400 mt-2 px-3 font-medium">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Input Area */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-6 z-50">
        <div className="bg-white border border-gray-300 hanken rounded-3xl shadow-2xl p-6 px-6">
          <form onSubmit={handleTextSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTextSubmit(e);
                  }
                }}
                placeholder="Type your response or use the microphone..."
                className="w-full text-xl focus:outline-none transition-all duration-200"
              />

              {/* Clear Button */}
              {textInput && (
                <button
                  type="button"
                  onClick={() => setTextInput("")}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}

              {/* Send Button */}
              {textInput.trim() && (
                <button
                  type="submit"
                  className="absolute right-16 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl shadow-lg transition-all duration-200 hover:scale-105"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Waveform and Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center">
                  <Waveform
                    isActive={callStatus === "active" && !isMuted}
                    width={120}
                    height={40}
                  />
                </div>

                {/* Call Status Indicator */}
                <div className="flex items-center space-x-2 text-sm">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      callStatus === "active"
                        ? "bg-green-500 animate-pulse"
                        : callStatus === "connecting"
                        ? "bg-yellow-500 animate-pulse"
                        : callStatus === "ended"
                        ? "bg-red-400"
                        : "bg-gray-400"
                    }`}
                  ></div>
                  <span className={`font-medium ${getStatusColor()}`}>
                    {getStatusText()}
                  </span>
                  {isConnecting && (
                    <div className="ml-2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                </div>
              </div>

              {/* Mute and Mic Buttons */}
              <div className="flex items-center space-x-3">
                {/* Mute Button */}
                {callStatus === "active" && (
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className={`p-3 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 ${
                      isMuted
                        ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                        : "bg-gradient-to-r from-gray-500 to-gray-600 text-white"
                    }`}
                  >
                    {isMuted ? (
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M16.5 12A4.5 4.5 0 0 0 12 7.5v.75m0 6v.75a4.5 4.5 0 0 1-4.5-4.5V12m0 0v.75a5.25 5.25 0 0 0 10.5 0V12m-9-7.5h7.5M12 18.75V22.5m-6-3.75h12" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18.364 5.636 5.636 18.364"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1h2v1a5 5 0 0 0 10 0v-1h2z" />
                      </svg>
                    )}
                  </button>
                )}

                {/* Microphone Button */}
                <button
                  type="button"
                  onClick={handleMicToggle}
                  disabled={isConnecting}
                  className={`p-4 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 ${
                    callStatus === "active"
                      ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                      : isConnecting
                      ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white"
                      : "bg-gradient-to-r bg-[#5FCA89] text-white"
                  }`}
                >
                  <div className="relative">
                    {isConnecting ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : callStatus === "active" ? (
                      <svg
                        className="w-6 h-6"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M6 6h12v12H6z" />
                      </svg>
                    ) : (
                      <svg
                        className="w-6 h-6"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1h2v1a5 5 0 0 0 10 0v-1h2z" />
                        <path d="M12 18v4m-4 0h8" />
                      </svg>
                    )}

                    {/* Pulse animation */}
                    {callStatus === "active" && (
                      <div className="absolute inset-0 rounded-2xl bg-red-400 opacity-40 animate-ping"></div>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
