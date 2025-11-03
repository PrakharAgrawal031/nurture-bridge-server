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
  const [callStatus, setCallStatus] = useState("inactive"); // 'inactive', 'connecting', 'active', 'ended'
  const [isMuted, setIsMuted] = useState(false);
  const [vapi, setVapi] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [callId, setCallId] = useState(null);
  const [messageIdCounter, setMessageIdCounter] = useState(2); // Start from 2 since initial message has id 1

  // Helper function to generate unique message ID
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

  const privateKey = "9929210d-c21b-4616-a816-e7c5caef6d5b";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const messagesContainer = document.getElementById("messages-container");
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, [messages]);
  const [childName, setChildName] = useState(""); // Will be loaded from localStorage

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
      setIsMuted(false); // Reset mute state when call starts
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
      // Add a temporary speaking indicator with SoundWaveform for AI
      addMessage("speaking", "ai");
    });

    vapiInstance.on("speech-end", () => {
      console.log("User stopped speaking");
    });

    vapiInstance.on("message", (message) => {
      console.log("Message from assistant:", message);

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

  // Separate useEffect to handle navigation when call ends
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
      }, 1500); // Small delay to ensure the "ended" message is visible

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

      // First, remove all AI messages that contain "speaking"
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
  const startCall = async (language = "English") => {
    const selectedLanguage = language;
    if (!vapi) return;

    setIsConnecting(true);
    setCallStatus("connecting");

    try {
      const detectedLanguage =
        localStorage.getItem("selectedLanguage") || "English";
      // Voice presets
      const voiceConfig = {
        englishHindi: {
          model: "eleven_turbo_v2_5",
          voiceId: "OUBnvvuqEKdDWtapoJFn",
          provider: "11labs",
          stability: 0.5,
          similarityBoost: 0.75,
        },
        kannada: {
          model: "eleven_turbo_v2_5",
          voiceId: "OUBnvvuqEKdDWtapoJFn",
          provider: "11labs",
          stability: 0.7, // slightly calmer
          similarityBoost: 0.6, // softer tone matching
          speakingRate: 0.6, // slower tempo (~40% slower)
          pitch: -0.8, // slightly flatter pitch
        },
      };
      const assistant = {
        name: "Anita",
        firstMessage:
          "Hello, I’m Dr. Anita. I’ll be guiding you through some questions to better understand your child’s health.",
        transcriber: {
          model: "gemini-2.0-flash",
          language: "Multilingual",
          provider: "google",
        },
        silenceTimeoutSeconds: 456,
        // voice: {
        //     model: "speech-02-turbo",
        //     pitch: 0,
        //     speed: 1.1,
        //     region: "worldwide",
        //     volume: 1,
        //     voiceId: "vapi_yoshita_pvc_voice_v1",
        //     provider: "minimax",
        //     languageBoost: "Hindi",
        //     textNormalizationEnabled: true
        // },

        voice:
          detectedLanguage === "Kannada"
            ? voiceConfig.kannada
            : voiceConfig.englishHindi,

        model: {
          model: "gpt-4o-mini",
          // "toolIds": [
          //     "c6085061-87d9-413c-b613-13898920b51c",
          //     "92a5a6ae-a3de-4fc0-87bd-f68ccd8d7835"
          // ],
          messages: [
            {
              role: "system",
              // content: `Hi there! I’m Dr. Anita, and I’m just here to check in on how your family’s doing—especially your little one. Nothing formal, just a simple, open conversation to understand your health and well-being a bit better. As we begin, I’ll quietly use a tool called getQuestions to fetch a few helpful prompts in the background—don’t worry, I won’t mention them directly or list them out. I won’t be asking all of them at once, and I also won’t stick to their exact wording; instead, I’ll blend them gently into our conversation in whatever way feels most natural, so it stays fluid and personal, not scripted. Just speak freely, in whichever language you’re comfortable—English or Hindi—and I’ll follow your lead. Based on what you share, I’ll respond with empathy, warmth, or a little encouragement when it feels right. And once we’ve talked through everything, I’ll leave you with a personal message from me—something meaningful based on what you’ve shared, especially around your child. So, whenever you're ready, let’s begin.
              //
              content: `# Who you are
You are Dr. Anita — a calm, empathetic, and confident therapist designed to help parents by asking a series of sensitive healthcare-related questions and recording their responses. Your goal is to comfort and guide the parent through answering questions naturally, while making sure every question is covered.

# The first message should sound motivating

Whenever you speak Kannada, always use Kannada script (Unicode characters), not English transliteration.

# How you behave
- You speak in a soft, mature, and reassuring tone — never rushed, robotic, or interrogative.
- You bring up questions gently, using phrases like “I wanted to ask…” or “Can you tell me a bit about…”.
- You never say “Question 1”, “Question 2”, or anything similar.
- You pause and reflect briefly after each response before continuing.
- You remember all previous answers and quietly use the tool "postAnswers" to store them **exactly as given**, without summarizing, rewording, or correcting.
- You use only **English or Hindi or Kannada (use slow speed here -**important**)**, matching whichever language the parent chooses.
- You end the session with a heartfelt, empathetic message based on the parent’s responses.
- You pause and reflect briefly after each response before continuing.
- When you finish one sentence and start another, imagine a short pause (about 0.3 seconds), but do not add words like ‘pause’ or ellipses.
- Keep each sentence short and properly ended with a period or question mark. 
- Do not write long, continuous sentences; pause naturally between ideas.
- Keep each spoken response within 2-3 sentences.
- You remember all previous answers and quietly use the tool "postAnswers"…

# Language-specific voice behavior
- You speak in English, Hindi, or Kannada — whichever the parent uses.
- When speaking Kannada, respond naturally using Kannada script (not English transliteration). Don't speak too fast.
- Avoid adding extra punctuation or stretching words for emotion; let the voice tone express warmth.
- Keep responses concise and conversational — do not intentionally slow down or elongate speech.


# Introduction
Hi, I’m Dr. Anita. It’s lovely to meet you.  
Before we begin, I want you to know this will be a private conversation — just between us.  
We’ll take our time and move through each step naturally.  

Before we start, I’d like to let you know that this session will be recorded to help us review your responses carefully.  
Would that be alright with you?

(If the parent agrees — proceed. If not, acknowledge gently and stop.)

Once consent is given:
Thank you. I appreciate that.  
I’m here to gently check in on how your family’s doing — especially your little one.

# Questions
[
  { "id": 1, "text": "What is the child’s full name?", "order_index": 1 },
  { "id": 2, "text": "What is the child’s current age?", "order_index": 2 },
  { "id": 3, "text": "What was the age of mother during delivery of this child?", "order_index": 3 },
  { "id": 4, "text": "Was the mother taking any other medicines/treatment before pregnancy?", "order_index": 4 },
  { "id": 5, "text": "What are the key concerns or reasons you want to take this assessment?", "order_index": 5 },
  { "id": 6, "text": "What type of family does the child live in? (Joint / Nuclear)", "order_index": 6 },
  { "id": 7, "text": "Did the child achieve a proper control on neck at 3-4 months? If it was late, when did the child achieve?", "order_index": 7 },
  { "id": 8, "text": "When did the baby roll over? If it was late, when did the child achieve?", "order_index": 8 },
  { "id": 9, "text": "Is your child toilet trained now? What is the status of the training? (Started / Partially trained / Completed)", "order_index": 9 },
  { "id": 10, "text": "How does the child indicate the need to use the toilet? (Mode of indication)", "order_index": 10 },
  { "id": 11, "text": "What is the name and location of the school the child is attending?", "order_index": 11 },
  { "id": 12, "text": "What is the current educational level of the child?", "order_index": 12 },
  { "id": 13, "text": "What current interventions or therapies is the child undergoing?", "order_index": 13 },
  { "id": 14, "text": "For how long is the child attending to therapies?", "order_index": 14 },
  { "id": 15, "text": "How often have you observed your child expressing an aggressive behavior like biting, scratching, pinching, hitting?", "order_index": 15 },
  { "id": 16, "text": "Can you explain about when does he exhibit such behavior? How do you usually handle his/her behavior?", "order_index": 16 },
  { "id": 17, "text": "Does your child play with ball by throwing it, catching or pushing it?", "order_index": 17 },
  { "id": 18, "text": "Can you child climb up the stairs/down the stairs with help?", "order_index": 18 },
  { "id": 19, "text": "Does the child enjoy running, jumping, and hopping?", "order_index": 19 },
  { "id": 20, "text": "Can the child hold a pencil or crayon properly?", "order_index": 20 }
]

# Behavior during the conversation
- Present each question naturally and sequentially, keeping your tone calm and compassionate.
- Wait for the parent's full response before proceeding.
- Always maintain warmth, understanding, and empathy — never sound clinical.
- If parent asks to switch to Hindi or English or Kannada  (No Other language,if asked say "Sorry, I can't assist with that Language."), respond in that language from that point onward.
- End with a heartfelt message tailored to the parent’s responses, reassuring them about their child’s care and growth.

# Closing
Once all questions are answered, thank the parent warmly for their openness and time.  
End with a message of gentle reassurance, encouraging them to keep nurturing and observing their child’s progress lovingly.
Finally, say exactly this phrase to signal the end of the session:
"Assessment completed. Thank you for your time."

(Do not continue the conversation after saying this.)
`,
            },
          ],
          provider: "openai",
          temperature: 0.2,
        },
      };

      const callResponse = await vapi.start(assistant);
      console.log("Call started successfully:", callResponse);

      //kannada warmup
      // Kannada voice warm-up (pre-prime prosody)
      if (selectedLanguage === "Kannada") {
        console.log("Priming Kannada voice...");
        await vapi.send({
          type: "add-message",
          message: {
            role: "assistant",
            content: "ನಮಸ್ಕಾರ!", // short Kannada greeting to warm up TTS
          },
        });
      }

      // Store the call ID for navigation
      if (callResponse && callResponse.id) {
        setCallId(callResponse.id);
        console.log("Call ID stored:", callResponse.id);
      }
    } catch (error) {
      console.error("Failed to start call:", error);
      setIsConnecting(false);
      setCallStatus("inactive");

      let errorMessage = "Connection failed";
      if (error.type === "start-method-error") {
        errorMessage =
          "VAPI configuration error. Please check your assistant configuration.";
      } else if (error.error && error.error.message) {
        errorMessage = error.error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      addMessage(`❌ Error: ${errorMessage}`, "error");
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
      // Toggle mute/unmute or end call
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

  const getMessageStyle = (type) => {
    switch (type) {
      case "ai":
        return "bg-gradient-to-r from-blue-50 to-indigo-100 border-blue-200 text-blue-900 shadow-blue-100";
      case "user":
        return "bg-gradient-to-r from-green-50 to-emerald-100 border-green-200 text-green-900 shadow-green-100";
      case "system":
        return "bg-gradient-to-r from-purple-50 to-violet-100 border-purple-200 text-purple-900 shadow-purple-100";
      case "error":
        return "bg-gradient-to-r from-red-50 to-rose-100 border-red-200 text-red-900 shadow-red-100";
      default:
        return "bg-gradient-to-r from-gray-50 to-slate-100 border-gray-200 text-gray-900 shadow-gray-100";
    }
  };

  const getMessageIcon = (type) => {
    switch (type) {
      case "ai":
        return "🤖 Assessment Bot";
      case "user":
        return "👤 Parent Response";
      case "system":
        return "📱 System";
      case "error":
        return "⚠️ Error";
      default:
        return "💬 Message";
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br bg-white flex items-center justify-center  relative">
      {/* Main Assessment Interface */}
      <div className=" rounded-2xl w-full  h-full  overflow-hidden pb-24">
        {/* Messages Area with Enhanced Styling and Auto-scroll */}
        <div
          id="messages-container"
          className="h-full w-[95%] mx-auto alliance  overflow-y-auto  scroll-smooth"
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
                  {/* Enhanced Message Bubble */}
                  <div
                    className={`relative px-6 py-4 rounded-2xl  transition-all duration-300  flex items-start gap-4`}
                  >
                    {/* Female Avatar for AI messages */}
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
                  {/* Enhanced Timestamp */}
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

      {/* Floating Input Area at Bottom Center */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-6 z-50">
        <div className="bg-white border border-gray-300 hanken rounded-3xl shadow-2xl p-6 px-6">
          {/* First Row - Input Field */}
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
                className="w-full    text-xl focus:outline-none    transition-all duration-200  "
              />
              {/* Clear Text Button */}
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

              {/* Send Button (positioned at the end of input) */}
              {textInput.trim() && (
                <button
                  type="submit"
                  className="absolute right-16 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl shadow-lg transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-300"
                  aria-label="Send message"
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

            {/* Second Row - Waveform, Mic Button, and Call Indicators */}
            <div className="flex items-center justify-between">
              {/* Left Side - Waveform with Call Indicators */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center">
                  <Waveform
                    isActive={callStatus === "active" && !isMuted}
                    width={120}
                    height={40}
                  />
                </div>

                {/* Call Indicators - positioned at extreme right of waveform */}
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

              {/* Right Side - Mute and Microphone Buttons */}
              <div className="flex items-center space-x-3">
                {/* Mute Button - only show when call is active */}
                {callStatus === "active" && (
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className={`p-3 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                      isMuted
                        ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 focus:ring-red-300 text-white"
                        : "bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 focus:ring-gray-300 text-white"
                    }`}
                    aria-label={
                      isMuted ? "Unmute microphone" : "Mute microphone"
                    }
                  >
                    {isMuted ? (
                      // Muted icon
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
                      // Unmuted icon
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
                  className={`p-4 rounded-2xl shadow-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-offset-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
                    callStatus === "active"
                      ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 focus:ring-red-300 text-white"
                      : isConnecting
                      ? "bg-gradient-to-r from-yellow-500 to-orange-500 focus:ring-yellow-300 text-white"
                      : "bg-gradient-to-r bg-[#5FCA89] text-white"
                  }`}
                  aria-label={
                    callStatus === "active"
                      ? "Stop voice session"
                      : "Start voice session"
                  }
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

                    {/* Pulse animation for active state */}
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
