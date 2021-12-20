
import JitsiMeetJS from '@lyno/lib-jitsi-meet';
import JitsiParticipant from '@lyno/lib-jitsi-meet/dist/JitsiParticipant';
import JitsiTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiTrack';
import { MediaType } from '@lyno/lib-jitsi-meet/dist/service/RTC/MediaType';
import { JitsiConnectionEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConnectionEvents';
import { JitsiConferenceEvents } from '@lyno/lib-jitsi-meet/dist/JitsiConferenceEvents';
import $ from 'jquery';

import { JitsiMeet } from './JitsiMeet';
import JitsiLocalTrack from '@lyno/lib-jitsi-meet/dist/modules/RTC/JitsiLocalTrack';

/** Creates a video/audio element in the UI for a given track
*   @param track JitsiTrack object
*/
function showTrack(track: JitsiTrack) {
	console.debug("showTrack", track);

	let userClass: string = "local"
	let participantId: string = "local";
	let idx: number = 1;

	let isRemote: boolean = !track.isLocal();

	if(isRemote) {
		participantId
		// @ts-ignore
		= track.getParticipantId();

		// Add this track to the list of known tracks if it's not already in it
		// @ts-ignore
		if (!jitsiMeet.remoteTracks[participantId]) {
			// @ts-ignore
			jitsiMeet.remoteTracks[participantId] = [];
		} // @ts-ignore

		idx = jitsiMeet.remoteTracks[participantId].push(track);
		userClass = "user" + participantId;
	}

	let audioContainer = document.querySelector("#audios");
	let videoContainer = document.querySelector("#videos");

	let trackClass = track.getTrackId();

	let el: HTMLAudioElement | HTMLVideoElement;
	if (track.getType() === MediaType.AUDIO) {
		let id = participantId + "audio" + idx;
		
		// FIXME: Currently gets called twice for local tracks
		if(document.getElementById(id)) {
			console.debug("Video element with the id", id, "already exists")
			return;
		}

		el = document.createElement("audio") as HTMLAudioElement;
		el.autoplay = true;
		el.muted = false;
		el.id = id;
		el.classList.add(userClass);
		el.classList.add(trackClass);

		audioContainer.appendChild(el);
		track.attach(el);
	} else { // Video or shared screen
		let id = participantId + "video" + idx;
		el = document.createElement("video") as HTMLVideoElement;
		el.autoplay = true;
		el.muted = true;
		el.id = id;
		el.classList.add(userClass);
		el.classList.add(trackClass);

		// FIXME: Currently gets called twice for local tracks
		if(document.getElementById(id)) {
			console.debug("Video element with the id", id, "already exists")
			return;
		}

		videoContainer.appendChild(el);
		track.attach(el);
	}
	console.debug("Attached to container", el)
}

/** Removes/disposes a track and removes its container from the UI
 *  @param track track to be removed */
function removeTrack(track: JitsiTrack) {
	let containers: HTMLElement[]
		// @ts-ignore // The containers property is not in the Typescript definition yet
		= track.containers;

	containers.forEach(container => {
		console.debug(`Removing track ${track.getTrackLabel()} from UI `, container)

		track.detach(container);
		container.remove(); // Remove from DOM
		track.dispose();
	});
}

/** Set up the UI controls */
function setUpUi() {
	console.info("Adding UI buttons");
	let actions = new Map<string, Function>([
		["Leave conference", () => jitsiMeet.leaveConference()],
		["Join conference TalentedBlocksGetThis", () => jitsiMeet.joinConference('TalentedBlocksGetThis')],
		["Join conference BrokenEncountersExpandAgo", () => jitsiMeet.joinConference('BrokenEncountersExpandAgo')],
		["Disconnect", () => jitsiMeet.disconnect()],
		["Connect", () => jitsiMeet.connect()],
		["Unmute", () => jitsiMeet.conference.getLocalAudioTrack().unmute()],
		["Mute", () => jitsiMeet.conference.getLocalAudioTrack().mute()],
	]);
	let controls = document.querySelector("#controls");

	actions.forEach((action, description) => {
		let button: HTMLElement = document.createElement("button", {});
		button.innerText = description;
		button.addEventListener("click", () => action());
		controls.appendChild(button);
	});
}

/** Update dynamic values in the UI */
function updateConferenceDisplay() {
	(document.querySelector("#conferenceName") as HTMLInputElement).value = jitsiMeet.conference?.getName() || "";
	document.querySelector("#joinButton").addEventListener("click", () => {
		let newConference = (document.querySelector("#conferenceName") as HTMLInputElement).value;
		jitsiMeet.joinConference(newConference);
	});
}

let jitsiMeet: JitsiMeet;

async function main() {
	// Only meet.jit.si has been found to work by default (using BOSH). Most other instances have restrictive CORS settings. 

	let roomName = "TalentedBlocksGetThis";

	// let config = JitsiMeet.CONFIG_MEET_JIT_SI;
	// Because the public Jitsi Meet instance does extra routing on connection based on the room name, it needs to be supplied earlier than ususal.
	// config.connectionOptions.roomName = roomName; // This property overrides the room name used on joinConference(). Setting both produces a warning. 

	let config = JitsiMeet.CONFIG_DOCKER;
	// Main address. wss://<your server>/xmpp-websocket for WebSocket or https://<your server>/http-bind for BOSH (WebSocket preferred)
	// config.connectionOptions.serviceUrl = "wss://localhost:8443/xmpp-websocket";
	// config.connectionOptions.serviceUrl = "https://localhost:8443/http-bind";

	config.conferenceOptions = { startAudioMuted: true };

	jitsiMeet = new JitsiMeet(config);

	// You could subscribe to connection events here, but you can also just catch the errors instead. 
	// jitsiMeet.addEventListener(JitsiConnectionEvents.CONNECTION_ESTABLISHED, () => console.log("Connected!"));

	var connectionEventListeners = new Map([
		[JitsiConnectionEvents.CONNECTION_DISCONNECTED, () => console.log("Disconnected from the server")],
		// [JitsiConnectionEvents.CONNECTION_ESTABLISHED, () => console.log("Connection established")], // The await would succeed
		// [JitsiConnectionEvents.CONNECTION_FAILED, () => console.log("Connection failed")], // The await would fail
	]);

	// Returns the user's id if the connection was successful and throws an error if it was not. 
	await jitsiMeet.connect(connectionEventListeners);

	// After this point the connection to the server is established, but the conference hasn't been joined yet. 
	console.log("Connected to the server!");

	var conferenceEventListeners = new Map<JitsiConferenceEvents, Function>([
		[JitsiConferenceEvents.CONFERENCE_JOIN_IN_PROGRESS, () => console.log("Joining conference ...")],
		[JitsiConferenceEvents.CONFERENCE_JOINED, () => console.log("... conference joined")],

		// These can also be added using jitsiMeet.conference.addEventListener and removed with jitsiMeet.conference.removeEventListener
		[JitsiConferenceEvents.USER_JOINED, (usr: string, user: JitsiParticipant) => console.log(`User ${usr} joined (display name: ${user.getDisplayName()})`),],
		[JitsiConferenceEvents.USER_LEFT, (usr: string) => console.log(`User ${usr} left`)],
		[JitsiConferenceEvents.MESSAGE_RECEIVED, (usr: string, msg: string) => console.log(`Received message from user ${usr}: ${msg}`)],
		[JitsiConferenceEvents.KICKED, () => console.log("Kicked :(")],

		[JitsiConferenceEvents.TRACK_ADDED, (track: JitsiTrack) => {
			track.isLocalAudioTrack() ? (track as JitsiLocalTrack).mute() : null; // Mute local audio track (startAudioMuted) doesn't seem to work
			showTrack(track);
		}], // Show a new track that has been added (e.g. on user join)
		[JitsiConferenceEvents.TRACK_REMOVED, (track: JitsiTrack) => removeTrack(track)], // Remove a user's UI elements when they leave

		[JitsiConferenceEvents.CONFERENCE_JOINED, async () => {
			// Create local media tracks
			await jitsiMeet.createLocalTracks();

			updateConferenceDisplay();
		}],

		[JitsiConferenceEvents.CONFERENCE_LEFT, () => { updateConferenceDisplay() }],
	]);

	await jitsiMeet.joinConference(roomName, conferenceEventListeners);

	// At this point the conference has been joined and the connection is all ready. 

	// Properly discard the object. May not be strictly necessary (leads to no errors on the other side), but enables us to say goodbye nicely. 
	$(window).on('beforeunload', () => jitsiMeet.dispose());

	// Mainly for debugging
	// @ts-ignore
	window.APP = jitsiMeet; // Similar to the official web app
	// @ts-ignore
	window.JitsiMeetJS = JitsiMeetJS; // useful in REPL

	setUpUi();
}

main().catch((e) => { alert(e); console.log(e) });