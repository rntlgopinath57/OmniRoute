import { Room, RoomEvent, Track } from "livekit-client";

window.NandiLiveKitClient = { Room, RoomEvent, Track };
window.dispatchEvent(new Event("nandi-livekit-ready"));
