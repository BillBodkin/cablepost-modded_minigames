const { app, BrowserWindow, ipcMain/*, TouchBarSegmentedControl */} = require('electron');
const { Client, Authenticator } = require('minecraft-launcher-core');
const msmc = require("msmc");
const electronLog = require('electron-log');
let path = require('path');
const fs = require('fs');
const get = require("async-get-file");
const Downloader = require('nodejs-file-downloader');
let exists = require('fs-exists-sync');
//const { formatWithOptions, callbackify, isRegExp } = require('util');
const os = require('os');
//let AdmZip = require("adm-zip");
const inly = require('inly');
const fetch = require('node-fetch');
//const { Console } = require('console');

msmc.setFetch(fetch);

let args = process.argv;

const launcher = new Client();
let win = null;
let mcAuth = null;
let rootDir = app.getPath('userData');
let launcherVersion = "0.0.12";
let lastLauncherVersion = "";
let redownloadWebContent = false;//true for testing - CHANGE ME ON PUBLISH
let pageLoaded = false;

let adminMode = args.includes("-adminMode");

let totalMemory = (Math.floor(os.totalmem() / 1073741824) - 1);
let minMaxMemory = totalMemory > 6 ? 4 : totalMemory;

let maxMemoryNum = Math.floor((os.freemem() / 1073741824) - 0.2);
if(maxMemoryNum > 8){
	maxMemoryNum = 8;
}
else if(maxMemoryNum < minMaxMemory){
	maxMemoryNum = minMaxMemory;
}

let minMemoryNum = Math.floor(maxMemoryNum / 2);
if(minMemoryNum < 1){
	minMemoryNum = 1;
}

let minMemory = minMemoryNum + "G";
let maxMemory = maxMemoryNum + "G";
let javaPath = undefined;

function Log(msg, popup = false){
	electronLog.log(msg);
	if(win != null){
		win.webContents.send("log", {
			msg: msg,
			popup: popup
		});
	}
	
	if(msg.includes("[main/INFO]: Stopping!")){
		setTimeout(function(){
			process.exit(0);
		}, 1000);
	}
}

async function CreateWindow () {
	win = new BrowserWindow({
		width: 800,
		height: 600,
		show: false,
		backgroundColor: '#292929',
		resizable: false,
		icon: rootDir + '/favicon.ico',
		webviewTag: true,
		webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }//,
		//frame: false
	});
	win.setMenuBarVisibility(false);
	win.loadFile('index.html');
}

app.whenReady().then(() => {
	Start();
});

async function Start(){
	if(fs.existsSync(rootDir + "/launcherVersion.txt")){
		lastLauncherVersion = fs.readFileSync(rootDir + "/launcherVersion.txt").toString().replace(/\s+/g, '');
	}
	else{
		lastLauncherVersion = "new";
	}
	if(lastLauncherVersion != launcherVersion || redownloadWebContent){
		//fs.writeFileSync(rootDir + "/launcherVersion.js", "let launcherVersion = " + launcherVersion + ";");//Not needed
		//fs.writeFileSync(rootDir + "/launcherVersion.txt", launcherVersion);//moved till after all downloads are completed
		
		Delete(rootDir + "/favicon.ico");
		await get(
			"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/favicon.ico", {
				directory: rootDir,
				filename: "favicon.ico"
			}
		);
	}
	
	await CreateWindow();
	win.once('ready-to-show', () => {
		win.show();
		DownloadLauncherPage();
	});
}

ipcMain.on("DownloadPortalbleJava", function(event, data){
	DownloadPortalbleJava();
});

async function DownloadPortalbleJava(callback = function(){win.webContents.send("DownloadedPortalbleJava");}){
	if (exists(rootDir + "/portableJava")){
		Log("Already have Portable Java");
		callback(false);
		return false;
		//Log("Deleting existing portable java...");
		//fs.rmdirSync(rootDir + "/portableJava", { recursive: true });
	}
	fs.mkdirSync(rootDir + "/portableJava");
	
	let downloadUrl = "";
	let downloadFile = "";
	
	let platform = os.platform().toString();
	if(platform == "linux"){
		downloadUrl = "https://download.java.net/java/GA/jdk16.0.1/7147401fd7354114ac51ef3e1328291f/9/GPL/openjdk-16.0.1_linux-x64_bin.tar.gz";
		downloadFile = "openjdk-16.0.1_linux-x64_bin.tar.gz";
	}
	else if(platform == "win32"){
		downloadUrl = "https://download.java.net/java/GA/jdk16.0.1/7147401fd7354114ac51ef3e1328291f/9/GPL/openjdk-16.0.1_windows-x64_bin.zip";
		downloadFile = "openjdk-16.0.1_windows-x64_bin.zip";
	}
	else{
		Log("Cannot download portable Java for this OS", true);
		return false;
	}
	
	Log("Downloading: " + downloadFile);
	const downloader = new Downloader({
		url: downloadUrl,
		directory: rootDir + "/portableJava",
		fileName: downloadFile,
		cloneFiles: false,
		onProgress:function(percentage, chunk, remainingSize){
        	Log("Downloading: " + downloadFile + " " + percentage.toString() + "%");
    	}
	});
	await downloader.download();
	
	//let zip = new AdmZip(rootDir + "/portableJava/" + downloadFile);
	//zip.extractAllTo(rootDir + "/portableJava/", true);
	
	const extract = inly(
		rootDir + "/portableJava/" + downloadFile,
		rootDir + "/portableJava/"
	);
	
	extract.on('progress', (percent) => {
		Log("Extracting: " + downloadFile + " " + percent.toString() + "%");
	});
	
	extract.on('end', () => {
		SetJavaPath();
		callback(true);
		return true;
	});
}

async function SetJavaPath(){
	Log("Getting Java path...");
	if(exists(rootDir + "javaPath.txt")){
		javaPath = fs.readFileSync(rootDir + "/javaPath.txt");
	}
	else if(exists(rootDir + "/portableJava/jdk-16.0.1/bin/java")){
		javaPath = rootDir + "/portableJava/jdk-16.0.1/bin/java";
	}
	else if(exists(rootDir + "/portableJava/jdk-16.0.1/bin/java.exe")){
		javaPath = rootDir + "/portableJava/jdk-16.0.1/bin/java.exe";
	}
	else{
		javaPath = undefined;
	}
	let jp = javaPath;
	if(jp == undefined){
		jp = "Default";
	}
	Log("Java path: " + jp);
}

async function DownloadLauncherPage(){
	if(launcherVersion != lastLauncherVersion || redownloadWebContent){
		Log("Deleting old Launcher Screen");
		
		Delete(rootDir + "/launcherScreen.html");
		Delete(rootDir + "/renderer.js");
		Delete(rootDir + "/style.css");
		
		await Sleep(100);
		Log("Downloading Launcher Screen");
		
		await get(
			"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherScreens/" + launcherVersion + "/launcherScreen.html", {
				directory: rootDir,
				filename: "launcherScreen.html"
			}
		);
		await get(
			"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherScreens/" + launcherVersion + "/launcherRenderer.js", {
				directory: rootDir,
				filename: "renderer.js"
			}
		);
		await get(
			"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherScreens/" + launcherVersion + "/launcherStyle.css", {
				directory: rootDir,
				filename: "style.css"
			}
		);
	}
	
	if(!exists(rootDir + "/three.min.js")){
		await get(
			"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/three.min.js", {
				directory: rootDir,
				filename: "three.min.js"
			}
		);
	}
	if(!exists(rootDir + "/GLTFLoader.js")){
		await get(
			"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/GLTFLoader.js", {
				directory: rootDir,
				filename: "GLTFLoader.js"
			}
		);
	}
	
	await Sleep(500);
	win.loadFile(rootDir + '/launcherScreen.html');
	win.once('ready-to-show', () => {
		pageLoaded = true;
		fs.writeFileSync(rootDir + "/launcherVersion.txt", launcherVersion);
	});
	await Sleep(500);
	await SetJavaPath();
	await DownloadPortalbleJava(async function(){
		await CheckLoggedIn();
		win.webContents.send("minMemory", minMemory);
		win.webContents.send("maxMemory", maxMemory);
	});
	
	if(adminMode){
		Log("In Admin Mode");
	}
}

async function CheckLoggedIn(){
	async function CheckLoggedIn2(){
		if(await CheckLoggedInMS()){
			return true;
		}
		if(await CheckLoggedInMojang()){
			return true;
		}
		
		return false;
	}
	
	if(await CheckLoggedIn2()){
		Log("(1) Logged in as: " + mcAuth.name);
		await DownloadSkin(mcAuth.uuid);
		while(!pageLoaded){
			await Sleep(50);
		};
		LowMemoryWarning();
		win.webContents.send("loggedIn", mcAuth.uuid);
	}
	else{
		while(!pageLoaded){
			await Sleep(50);
		};
		LowMemoryWarning();
		win.webContents.send("showLoginArea");
	}
}

function LowMemoryWarning(){
	if(maxMemoryNum <= 2){
		Log("Low memory! Close other programs and restart launcher.", true)
	}
	
	if(totalMemory <= 4){
		Log("You may not have enough RAM to play this!", true)
	}
}

async function CheckLoggedInMS(){
	if(!exists(rootDir + "/msmcAuth.json")){
		return false;
	}
	
	try {
		let mcAuthJson = require(rootDir + "/msmcAuth.json");
		mcAuth = await msmc.refresh(mcAuthJson.profile);
		if(mcAuth == null){
			throw "Failed to login";
		}
		mcAuth.name = mcAuth.profile.name;
		mcAuth.uuid = mcAuth.profile.id;
		fs.writeFileSync(rootDir + "/msmcAuth.json", JSON.stringify(mcAuth));
		return true;
	}
	catch(e){
		console.log(e);
		Log("Failed to auto login", true);
		mcAuth = null;
		//Delete(rootDir + "/msmcAuth.json");//brb
		return false;
	}
	
	//msmc.MSLogin(mcAuthJson.access_token, callback, updates);
	
	//fs.writeFileSync(rootDir + "/msmcAuth.json", JSON.stringify(mcAuth));
}

async function CheckLoggedInMojang(){
	if(!exists(rootDir + "/mcAuth.json")){
		return false;
	}
	
	try{
		let mcAuthJson = require(rootDir + "/mcAuth.json");
		//console.log(mcAuthJson.access_token);
		//console.log(mcAuthJson.client_token);
		//console.log(mcAuthJson.selected_profile);
		
		//mcAuth = await Authenticator.refreshAuth(mcAuthJson.access_token, mcAuthJson.client_token, null);//mcAuthJson.selected_profile
		mcAuth = await RefreshToken(mcAuthJson.access_token, mcAuthJson.client_token);
		if(mcAuth == null){
			throw "Failed to login";
		}
		mcAuth.name = mcAuth.selected_profile.name;
		mcAuth.uuid = mcAuth.selected_profile.id;
		fs.writeFileSync(rootDir + "/mcAuth.json", JSON.stringify(mcAuth));
		return true;
	}
	catch(e){
		console.log(e);
		Log("Failed to auto login", true);
		mcAuth = null;
		Delete(rootDir + "/mcAuth.json");
		return false;
	}
}

async function DownloadSkin(uuid){
	Log("Downloading skin");
	let skinUrls = [
		"https://mc-heads.net/skin/",
		"https://crafatar.com/skins/",
		"https://minotar.net/skin/"
	];
	for(let i = 0; i < skinUrls.length; i++){
		try {
			await get(
				skinUrls[i] + uuid, {
					directory: rootDir,
					filename: "skin.png"
				}
			);
			break;
		}catch(e){
			Log("Failed to download skin, will try again " + i.toString());
			await Sleep(500);
		}
	}
	await Sleep(100);
	Log("Downloaded skin");
}

async function RefreshToken(accessToken, clientToken){
	let result = await fetch('https://authserver.mojang.com/refresh', {
		method: 'POST',
		body: JSON.stringify({
			accessToken: accessToken,
			clientToken: clientToken
		}),
		headers: { 'Content-Type': 'application/json' }
	});
	
	const json = await result.json();
	//console.log(json);
	
	if (json.error) {
		Log("Error: " + json.error.toString());
		return null;
	} else {
		return {
			access_token: json.accessToken,
			client_token: json.clientToken,
			selected_profile: json.selectedProfile
		};
	}
}

ipcMain.on("mojang_login", async function(event, data){
	if(mcAuth != null){
		return;
	}
	Log("Logging in...");
	try{
		mcAuth = await Authenticator.getAuth(data.username, data.password);
		if(mcAuth.selected_profile == null){
			Log("Invalid login", true);
			mcAuth = null;
			win.webContents.send("showLoginArea");
			return;
		}
		if(data.save){
			fs.writeFileSync(rootDir + "/mcAuth.json", JSON.stringify(mcAuth));
		}
	}
	catch(e){
		Log("Login error: " + e, true);
		mcAuth = null;
		win.webContents.send("showLoginArea");
		return;
	}
	
	Log("Logged in as: " + mcAuth.name);
	await DownloadSkin(mcAuth.uuid);
	win.webContents.send("loggedIn", mcAuth.uuid);
});

ipcMain.on("microsoft_login", async function(event, data){
	if(mcAuth != null){
		return;
	}
	
	Log("Opening Microsoft login window...");
	
	msmc.fastLaunch("electron", (update) => {
		if(update.error != null){
			Log("Microsoft login - " + update.type + ": " + update.error, true);
		}
		else{
			Log("Microsoft login - " + update.type + ": " + (update.data ?? "") + " " + (update.percent == null ? "" : (update.percent.toString() + "%")));
		}
	}).then(result => {
		if (msmc.errorCheck(result)){
			Log("Microsoft login - Failed to log in (1) because: " + result.type + " " + (result.reason ?? ""), true);
			mcAuth = null;
			win.webContents.send("showLoginArea");
			return;
		}
		//console.log("Microsoft login - Player profile and mojang token: " + JSON.stringify(result));
		Log("Logged in using Microsoft!");
		mcAuth = result;
		mcAuth.name = mcAuth.profile.name;
		mcAuth.uuid = mcAuth.profile.id;
		async function LoggedInMS(){
			Log("Logged in as: " + mcAuth.name);
			await DownloadSkin(mcAuth.uuid);
			if(data.save){
				fs.writeFileSync(rootDir + "/msmcAuth.json", JSON.stringify(mcAuth));
			}
			win.webContents.send("loggedIn", mcAuth.uuid);
		}
		LoggedInMS();
	}).catch(reason => {
		Log("Microsoft login - Failed to log in (2) because: " + reason, true);
		mcAuth = null;
		win.webContents.send("showLoginArea");
	});
});

ipcMain.on("play", function(event, data){
	UpdateAndPlay();
});

ipcMain.on("java_min_memory", function(event, data){
	minMemory = data;
});

ipcMain.on("java_max_memory", function(event, data){
	maxMemory = data;
});

async function UpdateAndPlay(){
	await UpdateFromJson();
	await Sleep(1000);
	Play();
}

function Sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function Play(){
	Log("Playing...");
	let opts = {
		clientPackage: null,
		authorization: mcAuth,
		root: rootDir + "/minecraft",
		version: {
			number: "1.16.5",
			type: "release",
			custom:'fabric-loader-0.11.6-1.16.5'
		},
		memory: {
			max: maxMemory,
			min: minMemory
		},
		javaPath: javaPath,
		customArgs: ["-Dlog4j2.formatMsgNoLookups=true"]
	}

	launcher.launch(opts);

	launcher.on('debug', (e) => Log(e.replace("<", "(").replace(">", ")")));
	launcher.on('data', (e) => Log(e.replace("<", "(").replace(">", ")")));
}

function Delete(file){
	file = path.resolve(file);
	if(exists(file)){
		fs.unlinkSync(file);
	}
}

async function UpdateFromJson(){
	Log("Current date and time is: " + new Date().toISOString());
	Log("Deleting old files");
	Delete(rootDir + "/modpackFiles.json");
	//fs.rmdirSync(rootDir + "/minecraft", { recursive: true });
	await Sleep(100);
	Log("Downloading modpackFiles.json");
	/*
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/modpackFiles.json", {
			directory: rootDir,
			filename: "modpackFiles.json"
		}
	);
	*/
	const downloader = new Downloader({
		url: "https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/modpackFiles.json",
		directory: rootDir,
		fileName: "modpackFiles.json",
		cloneFiles: false,
		onProgress:function(percentage, chunk, remainingSize){
        	Log("Downloading modpackFiles.json " + percentage.toString() + "%");
    	}
	});
	await downloader.download();
	Log("Downloaded modpackFiles.json");
	await Sleep(500);
	let modpackFiles = require(rootDir + "/modpackFiles.json");
	
	if(adminMode){
		modpackFiles.minecraft.mods["baritone-standalone-fabric-1.6.3.jar"] = {
			FILE: true,
			url: "https://objects.githubusercontent.com/github-production-release-asset-2e65be/143175496/65f8eb00-6801-11eb-9389-5bbedb84995d?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIWNJYAX4CSVEH53A%2F20211127%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20211127T152742Z&X-Amz-Expires=300&X-Amz-Signature=23b00d738f3e311836e08ebdca87c301e369935a655782d13fd288302f1e6ba6&X-Amz-SignedHeaders=host&actor_id=18099196&key_id=0&repo_id=143175496&response-content-disposition=attachment%3B%20filename%3Dbaritone-standalone-fabric-1.6.3.jar&response-content-type=application%2Foctet-stream",
			credict: "https://github.com/cabaletta/baritone/"
		}
	}
	
	let modpackFilesCurrent = {
		minecraft: {}
	};
	if(exists(rootDir + "/modpackFilesCurrent.json")){
		modpackFilesCurrent = require(rootDir + "/modpackFilesCurrent.json");
	}
	await CheckFolderUpdated(rootDir + "/minecraft", modpackFiles.minecraft, modpackFilesCurrent.minecraft);
	Log("Update complete!");
}

async function CheckFolderUpdated(folder, data, dataCurrent){
	Log(folder);
	if (!exists(folder)){
		fs.mkdirSync(folder);
	}
	
	if(folder == rootDir + "/minecraft/mods" || folder == (rootDir + "/minecraft/mods").replace("/", "\\")){
		//delete any mods not in JSON
		fs.readdirSync(folder).forEach(file => {
			if(!(file in data)){
				let fStat = fs.lstatSync(folder + "/" + file);
				if(fStat.isFile()){
					Log("Deleting old mod: " + file);
					fs.unlinkSync(folder + "/" + file);
				}
			}
		});
	}
	
	for(let item in data){
		if(data[item].FILE === true){
			if(dataCurrent[item] == null || data[item].version != dataCurrent[item].version){
				Log("Deleting: " + folder + "/" + item);
				Delete(folder + "/" + item);
			}
			if(!exists(path.resolve(folder + "/" + item))){
				Log("Downloading: " + data[item].url + "\nTo: " + path.resolve(folder + "/" + item));
				try{
					/*
					await get(
						data[item].url,
						{
							directory: folder,
							filename: item
						}
					);
					*/
					const downloader = new Downloader({
						url: data[item].url,
						directory: folder,
						fileName: item,
						cloneFiles: false,
						onProgress:function(percentage, chunk, remainingSize){
							Log("Downloading: " + data[item].url + "\nTo: " + path.resolve(folder + "/" + item) + "\n" + percentage.toString() + "%");
						}
					});
					await downloader.download();
				}
				catch(e){
					Log("Error downloading", data[item].url, e);
					throw e;
				}
			}
			else{
				Log("Got file " + folder + "/" + item);
			}
		}
		else{
			let nextCurrentData = {};
			if(dataCurrent[item] != null){
				nextCurrentData = dataCurrent[item];
			}
			await CheckFolderUpdated(folder + "/" + item, data[item], nextCurrentData);
		}
	}
	
	fs.copyFileSync(rootDir + "/modpackFiles.json", rootDir + "/modpackFilesCurrent.json");
}