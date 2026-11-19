# Watches and controls the Spotify desktop app for KKaraoke (Windows). Started by spotify-windows.js.
#
# Reading and pause/play/next go through Windows' media session (the one behind the volume flyout's media controls),
# which Spotify fills in. Muting goes through Windows' per-app volume (the Volume mixer), so Spotify can be kept silent
# without touching the system volume. Everything is ASCII so Windows PowerShell 5.1 reads this file whatever its encoding.
#
# Output, one JSON object per line:
#   {"type":"state","running":true,"status":"playing|paused|stopped","title":..,"artist":..,"album":..,
#    "trackNumber":3,"duration":278.0,"position":12.3}   when the song or play state changes
#   {"type":"position","id":N,"position":12.3}           the answer to the "position" command
#   {"type":"volume","saved":0.6}                        the volume Spotify had before it was muted
#   {"type":"error","message":".."}
# Input, one JSON object per line: {"cmd":"mute|unmute|pause|play|next|position|restore", "id":N, "volume":0.6}

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class KStdin {
  public static readonly ConcurrentQueue<string> Lines = new ConcurrentQueue<string>();
  public static volatile bool Closed;
  public static void Start() {
    Thread t = new Thread(delegate() {
      string line;
      while ((line = Console.In.ReadLine()) != null) Lines.Enqueue(line);
      Closed = true;
    });
    t.IsBackground = true;
    t.Start();
  }
}

public static class KAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IManager2 {
    int GetAudioSessionControl(IntPtr audioSessionGuid, int streamFlags, out IntPtr control);
    int GetSimpleAudioVolume(IntPtr audioSessionGuid, int streamFlags, out IntPtr volume);
    int GetSessionEnumerator(out ISessions sessions);
  }

  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISessions {
    int GetCount(out int count);
    int GetSession(int index, out IControl session);
  }

  // IAudioSessionControl2, with the methods of IAudioSessionControl it inherits first
  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IControl {
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName(IntPtr name, ref Guid context);
    int GetIconPath(out IntPtr path);
    int SetIconPath(IntPtr path, ref Guid context);
    int GetGroupingParam(out Guid param);
    int SetGroupingParam(ref Guid param, ref Guid context);
    int RegisterAudioSessionNotification(IntPtr notifications);
    int UnregisterAudioSessionNotification(IntPtr notifications);
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out uint pid);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
  }

  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IVolume {
    int SetMasterVolume(float level, ref Guid context);
    int GetMasterVolume(out float level);
    int SetMute(bool mute, ref Guid context);
    int GetMute(out bool mute);
  }

  static List<IVolume> SpotifyVolumes() {
    List<IVolume> found = new List<IVolume>();
    IEnumerator enumerator = (IEnumerator)new Enumerator();
    IDevice device;
    if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0) return found;
    Guid iid = typeof(IManager2).GUID;
    object manager;
    if (device.Activate(ref iid, 23, IntPtr.Zero, out manager) != 0) return found;
    ISessions sessions;
    if (((IManager2)manager).GetSessionEnumerator(out sessions) != 0) return found;
    int count;
    sessions.GetCount(out count);
    for (int i = 0; i < count; i++) {
      IControl control;
      if (sessions.GetSession(i, out control) != 0) continue;
      uint pid;
      control.GetProcessId(out pid);
      try {
        if (string.Equals(Process.GetProcessById((int)pid).ProcessName, "Spotify", StringComparison.OrdinalIgnoreCase))
          found.Add((IVolume)control);
      } catch { }
    }
    return found;
  }

  // Spotify's volume in the mixer (0 to 1), or -1 while it has no audio session (it makes one when it first plays).
  public static double Get() {
    foreach (IVolume v in SpotifyVolumes()) { float level; v.GetMasterVolume(out level); return level; }
    return -1;
  }

  public static void Set(double level) {
    Guid context = Guid.Empty;
    foreach (IVolume v in SpotifyVolumes()) v.SetMasterVolume((float)level, ref context);
  }
}
'@

# --- the media session -------------------------------------------------------------------------------------------
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Wait-Operation($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $null = $task.Wait(5000)
  if ($task.IsCompleted) { return $task.Result }
  return $null
}

$manager = Wait-Operation ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-SpotifySession {
  foreach ($session in $manager.GetSessions()) {
    if ($session.SourceAppUserModelId -like '*Spotify*') { return $session }
  }
  return $null
}

function Write-Json($object) { [Console]::Out.WriteLine(($object | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

function Read-State {
  $session = Get-SpotifySession
  if (-not $session) { return @{ type = 'state'; running = $false; status = 'stopped' } }
  $status = switch ([int]$session.GetPlaybackInfo().PlaybackStatus) { 4 { 'playing' } 5 { 'paused' } default { 'stopped' } }
  $properties = Wait-Operation ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $timeline = $session.GetTimelineProperties()
  $position = $timeline.Position.TotalSeconds
  if ($status -eq 'playing') { $position += ([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalSeconds }
  $duration = ($timeline.EndTime - $timeline.StartTime).TotalSeconds
  return @{
    type = 'state'; running = $true; status = $status
    title = [string]$properties.Title; artist = [string]$properties.Artist; album = [string]$properties.AlbumTitle
    trackNumber = [int]$properties.TrackNumber; duration = [math]::Round($duration, 1); position = [math]::Round([math]::Max(0, $position), 1)
  }
}

function Invoke-Control($name) {
  $session = Get-SpotifySession
  if (-not $session) { return }
  $null = Wait-Operation ($session.$name()) ([bool])
}

# --- the loop ----------------------------------------------------------------------------------------------------
[KStdin]::Start()
$muted = $false
$saved = $null
$last = ''

while ($true) {
  try {
    $line = $null
    while ([KStdin]::Lines.TryDequeue([ref]$line)) {
      $command = $line | ConvertFrom-Json
      switch ($command.cmd) {
        'mute' { $muted = $true }
        'unmute' {
          $muted = $false
          if ($null -ne $saved) { [KAudio]::Set($saved); $saved = $null }
        }
        'restore' { if ($null -ne $command.volume) { [KAudio]::Set([double]$command.volume) } }
        'pause' { Invoke-Control 'TryPauseAsync' }
        'play' { Invoke-Control 'TryPlayAsync' }
        'next' { Invoke-Control 'TrySkipNextAsync'; Invoke-Control 'TryPlayAsync' }
        'position' { Write-Json @{ type = 'position'; id = $command.id; position = (Read-State).position } }
      }
    }

    if ($muted) {
      # Spotify has no audio session until it first plays, and a new one is made now and then: keep applying it
      $volume = [KAudio]::Get()
      if ($volume -gt 0) {
        if ($null -eq $saved) { $saved = $volume; Write-Json @{ type = 'volume'; saved = $saved } }
        [KAudio]::Set(0)
      }
    }

    $state = Read-State
    $key = '{0}|{1}|{2}|{3}|{4}' -f $state.running, $state.status, $state.title, $state.artist, $state.duration
    if ($key -ne $last) { $last = $key; Write-Json $state }
  } catch {
    Write-Json @{ type = 'error'; message = $_.Exception.Message }
    Start-Sleep -Seconds 2
  }

  if ([KStdin]::Closed -and [KStdin]::Lines.IsEmpty) { break } # KKaraoke is gone
  Start-Sleep -Milliseconds 250
}
if ($null -ne $saved) { [KAudio]::Set($saved) }
