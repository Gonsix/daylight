"""Capture isolated preview frames through Orca, then encode a video with ffmpeg.
No Obsidian application, vault, or personal data is accessed.
"""
import argparse,json,subprocess,time,shutil
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('page');parser.add_argument('scene',choices=['events','tasks','projects']);parser.add_argument('--output',default='/private/tmp');args=parser.parse_args()
def orca(*parts):
    result=subprocess.run(['orca',*parts,'--json'],capture_output=True,text=True,check=True)
    data=json.loads(result.stdout)
    if not data.get('ok'):raise RuntimeError(data)
    return data['result']
def decode(raw):
    while isinstance(raw,str):raw=json.loads(raw)
    return raw
page=['--page',args.page]
orca('goto',*page,'--url',f'http://127.0.0.1:8137/?scene={args.scene}')
orca('viewport',*page,'--width','1280','--height','960')
orca('wait',*page,'--text','Timeline');time.sleep(1)
folder=Path(args.output)/f'daylight-{args.scene}-frames';folder.mkdir(exist_ok=True)
source=Path(__file__).with_name('scenes.js').read_text().strip().rstrip(';')
orca('eval',*page,'--expression',"demo.done=null;demo.failure=null;"+source+".then(result=>{demo.done=result}).catch(error=>{demo.failure=error.message});'started'")
frames=[];start=time.monotonic();state=None
for index in range(1000):
    result=orca('screenshot',*page);now=time.monotonic();dest=folder/f'{index:05}.png';shutil.copyfile(result['path'],dest);frames.append((dest,now))
    if index%8==0:
        state=decode(orca('eval',*page,'--expression','JSON.stringify({done:demo.done,failure:demo.failure})')['result'])
        if state.get('failure'):raise RuntimeError(state['failure'])
        if state.get('done'):break
    if now-start>110:raise RuntimeError('Scene timed out')
    time.sleep(.06)
assert state and state['done'],state
rows=state['done']['state']
if args.scene=='events':
    assert any(row['title']=='Design review' and row['projectPath']=='website.md' for row in rows)
elif args.scene=='tasks':
    task=next(row for row in rows if row['title']=='Write the launch brief')
    sessions=task['taskSessions']
    assert task['status']=='done' and len(sessions)==2
    assert sum(session['end']-session['start'] for session in sessions)==45*60*1000
    dragged=next(row for row in rows if row['title']=='Check mobile layout')
    assert dragged['status']=='on_going' and len(dragged['taskSessions'])==1
else:
    assert sum(row['path'].startswith('task-') for row in rows)==9
(folder/'state.json').write_text(json.dumps(state['done'],indent=2))
lines=['ffconcat version 1.0']
for index,(file,timestamp) in enumerate(frames):
    duration=frames[index+1][1]-timestamp if index+1<len(frames) else 1
    lines.extend([f"file '{file}'",f'duration {duration:.6f}'])
lines.append(f"file '{frames[-1][0]}'")
concat=folder/'frames.ffconcat';concat.write_text('\n'.join(lines)+'\n')
output=Path(args.output)/f'daylight-{args.scene}.mp4'
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-vf','fps=24','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],check=True)
print(json.dumps({'path':str(output),'frames':len(frames),'duration':frames[-1][1]-frames[0][1]+1,'state':state['done']['scene']}))
