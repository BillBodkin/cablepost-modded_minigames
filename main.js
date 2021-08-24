const { app, BrowserWindow, ipcMain, TouchBarSegmentedControl } = require('electron');
const { Client, Authenticator } = require('minecraft-launcher-core');
const electronLog = require('electron-log');
let path = require('path');
const fs = require('fs');
const get = require("async-get-file");
const Downloader = require('nodejs-file-downloader');
let exists = require('fs-exists-sync');
const { formatWithOptions } = require('util');
const os = require('os');
let AdmZip = require("adm-zip");
const inly = require('inly');
const fetch = require('node-fetch');
const { Console } = require('console');

const launcher = new Client();
let win = null;
let mcAuth = null;
let rootDir = app.getPath('userData');
let launcherVersion = "0.0.5";

let maxMemoryNum = (Math.floor(os.totalmem() / 1073741824) - 1);
if(maxMemoryNum > 8){
	maxMemoryNum = 8;
}
else if(maxMemoryNum < 1){
	maxMemoryNum = 1;
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

function CreateWindow () {
	win = new BrowserWindow({
		width: 800,
		height: 600,
		resizable: false,
		icon: __dirname + '/favicon.ico',
		webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }//,
		//frame: false
	});
	win.setMenuBarVisibility(false);

	win.loadFile('index.html');
}

app.whenReady().then(() => {
	fs.writeFileSync(rootDir + "/launcherVersion.js", "let launcherVersion = " + launcherVersion + ";");
	fs.writeFileSync(rootDir + "/launcherVersion.txt", launcherVersion);
	CreateWindow();
	DownloadLauncherPage();
});

ipcMain.on("DownloadPortalbleJava", function(event, data){
	DownloadPortalbleJava();
});

async function DownloadPortalbleJava(){
	if (exists(rootDir + "/portableJava")){
		Log("Already have Portable Java", true);
		return false;
		Log("Deleting existing portable java...");
		fs.rmdirSync(rootDir + "/portableJava", { recursive: true });
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
		win.webContents.send("DownloadedPortalbleJava");
		return true;
	});
}

async function SetJavaPath(){
	Log("Getting Java path...");
	if(exists(rootDir + "javaPath.txt")){
		javaPath = fs.readFileSync(rootDir + "javaPath.txt");
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
	Delete(rootDir + "/launcherScreen.html");
	Delete(rootDir + "/renderer.js");
	await Sleep(100);
	Log("Downloading Launcher Screen");
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherScreen.html", {
			directory: rootDir,
			filename: "launcherScreen.html"
		}
	);
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherRenderer.js", {
			directory: rootDir,
			filename: "renderer.js"
		}
	);
	await get(
		"https://cablepost.co.uk/mcModpack/Modded%20Minigames/Launcher/launcherStyle.css", {
			directory: rootDir,
			filename: "style.css"
		}
	);
	await Sleep(500);
	
	win.loadFile(rootDir + '/launcherScreen.html');
	await Sleep(100);
	await SetJavaPath();
	await CheckLoggedIn();
	win.webContents.send("minMemory", minMemory);
	win.webContents.send("maxMemory", maxMemory);
}

async function CheckLoggedIn(){
	if(!exists(rootDir + "/mcAuth.json")){
		win.webContents.send("showLoginArea");
		return;
	}
	
	let mcAuthJson = require(rootDir + "/mcAuth.json");
	//console.log(mcAuthJson.access_token);
	//console.log(mcAuthJson.client_token);
	//console.log(mcAuthJson.selected_profile);
	
	try{
		//mcAuth = await Authenticator.refreshAuth(mcAuthJson.access_token, mcAuthJson.client_token, null);//mcAuthJson.selected_profile
		mcAuth = await RefreshToken(mcAuthJson.access_token, mcAuthJson.client_token);
		mcAuth.name = mcAuth.selected_profile.name;
		mcAuth.uuid = mcAuth.selected_profile.id;
		if(mcAuth == null){
			throw "Failed to login";
		}
		fs.writeFileSync(rootDir + "/mcAuth.json", JSON.stringify(mcAuth));
	}
	catch(e){
		console.log(e);
		Log("Failed to auto login", true);
		mcAuth = null;
		win.webContents.send("showLoginArea");
		return false;
	}
	//console.log(mcAuth);
	
	Log("Logged in as: " + mcAuth.name);
	await DownloadSkin(mcAuth.uuid);
	win.webContents.send("loggedIn", mcAuth.uuid);
	return true;
}

async function DownloadSkin(uuid){
	await get(
		"https://crafatar.com/skins/" + uuid, {
			directory: rootDir,
			filename: "skin.png"
		}
	);
	await Sleep(100);
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
		javaPath: javaPath
	}

	launcher.launch(opts);

	launcher.on('debug', (e) => Log(e));
	launcher.on('data', (e) => Log(e));
}

function Delete(file){
	file = path.resolve(file);
	if(exists(file)){
		fs.unlinkSync(file);
	}
}

async function UpdateFromJson(){
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
	
	if(folder == rootDir + "/minecraft/mods" || folder == (rootDir + "/minecraft/mods").replace("/", "\\")){s
		//delete any mods not in JSON
		fs.readdirSync(folder).forEach(file => {
			if(!(file in data)){
				Log("Deleting old mod: " + file);
				fs.unlinkSync(folder + "/" + file);
			}
		});
	}
	
	for(let item in data){
		if(data[item].FILE === true){
			if(dataCurrent[item] != null && data[item].version != dataCurrent[item].version){
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