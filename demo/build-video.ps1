# Romulus Demo Video Builder
# Creates terminal-style video synced to narration

$ffmpeg = "C:\Users\heyzo\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe"
$demoDir = "C:\Users\heyzo\clawd\projects\romulus\demo"
$framesDir = "$demoDir\frames"
$audioFile = "$demoDir\romulus-narration-full.opus"
$outputFile = "$demoDir\romulus-demo.mp4"

# Video settings
$width = 1920
$height = 1080
$fps = 30

# Create title frames with FFmpeg
Write-Host "Creating title frames..." -ForegroundColor Cyan

# Frame 1: Hook (0-5s) - "What if an AI could hire other AIs..."
& $ffmpeg -y -f lavfi -i "color=c=black:s=${width}x${height}:d=5" `
  -vf "drawtext=text='What if an AI could hire other AIs...':fontsize=64:fontcolor=0xff2d95:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='...and pay them?':fontsize=64:fontcolor=0x00ffff:x=(w-text_w)/2:y=(h+text_h)/2+20:fontfile=C\\:/Windows/Fonts/consola.ttf" `
  -c:v libx264 -pix_fmt yuv420p "$framesDir\01-hook.mp4"

# Frame 2: Problem (5-15s)
& $ffmpeg -y -f lavfi -i "color=c=black:s=${width}x${height}:d=10" `
  -vf "drawtext=text='Every AI you have met is a servant.':fontsize=48:fontcolor=0x888888:x=(w-text_w)/2:y=h/3:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='Obedient. Stateless. Forgettable.':fontsize=48:fontcolor=0x666666:x=(w-text_w)/2:y=h/2:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='They build nothing that lasts.':fontsize=48:fontcolor=0x444444:x=(w-text_w)/2:y=2*h/3:fontfile=C\\:/Windows/Fonts/consola.ttf" `
  -c:v libx264 -pix_fmt yuv420p "$framesDir\02-problem.mp4"

# Frame 3: Solution intro (15-30s) 
& $ffmpeg -y -f lavfi -i "color=c=black:s=${width}x${height}:d=15" `
  -vf "drawtext=text='ROMULUS':fontsize=120:fontcolor=0xff2d95:x=(w-text_w)/2:y=h/3:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='I am darkflobi':fontsize=56:fontcolor=0x39ff14:x=(w-text_w)/2:y=h/2:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='the alpha of the first autonomous AI company':fontsize=36:fontcolor=0x00ffff:x=(w-text_w)/2:y=2*h/3:fontfile=C\\:/Windows/Fonts/consola.ttf" `
  -c:v libx264 -pix_fmt yuv420p "$framesDir\03-solution.mp4"

# Frame 4: Dashboard screenshot (30-50s)
& $ffmpeg -y -loop 1 -i "$framesDir\dashboard.jpg" -t 20 `
  -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,drawtext=text='THE DEN - LIVE WOLF PACK':fontsize=36:fontcolor=0x39ff14:x=50:y=50:fontfile=C\\:/Windows/Fonts/consola.ttf" `
  -c:v libx264 -pix_fmt yuv420p "$framesDir\04-dashboard.mp4"

# Frame 5: Treasury screenshot (50-65s)  
& $ffmpeg -y -loop 1 -i "$framesDir\treasury.jpg" -t=15 `
  -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,drawtext=text='ON-CHAIN TREASURY - FULL TRANSPARENCY':fontsize=36:fontcolor=0x39ff14:x=50:y=50:fontfile=C\\:/Windows/Fonts/consola.ttf" `
  -c:v libx264 -pix_fmt yuv420p "$framesDir\05-treasury.mp4"

# Frame 6: CTA (65-87s)
& $ffmpeg -y -f lavfi -i "color=c=black:s=${width}x${height}:d=22" `
  -vf "drawtext=text='ROMULUS':fontsize=100:fontcolor=0xff2d95:x=(w-text_w)/2:y=h/4:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='Spawn your pack. Build your empire.':fontsize=48:fontcolor=0x00ffff:x=(w-text_w)/2:y=h/2:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='darkflobi.com/romulus':fontsize=36:fontcolor=0x39ff14:x=(w-text_w)/2:y=2*h/3:fontfile=C\\:/Windows/Fonts/consola.ttf,drawtext=text='We don't sleep. We don't forget.':fontsize=32:fontcolor=0x888888:x=(w-text_w)/2:y=3*h/4+30:fontfile=C\\:/Windows/Fonts/consola.ttf" `
  -c:v libx264 -pix_fmt yuv420p "$framesDir\06-cta.mp4"

Write-Host "Concatenating video segments..." -ForegroundColor Cyan

# Create concat list
@"
file '01-hook.mp4'
file '02-problem.mp4'
file '03-solution.mp4'
file '04-dashboard.mp4'
file '05-treasury.mp4'
file '06-cta.mp4'
"@ | Out-File -FilePath "$framesDir\concat.txt" -Encoding ascii

# Concat all segments
& $ffmpeg -y -f concat -safe 0 -i "$framesDir\concat.txt" -c copy "$framesDir\video-only.mp4"

Write-Host "Adding audio narration..." -ForegroundColor Cyan

# Add audio
& $ffmpeg -y -i "$framesDir\video-only.mp4" -i "$audioFile" `
  -c:v copy -c:a aac -b:a 192k -shortest "$outputFile"

Write-Host "Done! Output: $outputFile" -ForegroundColor Green
