'use client';

export default function MusicQueue() {
    return (
        <div className="w-full h-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10 overflow-y-auto space-y-3 text-white text-sm">
                <div>1. 海阔天空 - Beyond</div>
                <div>2. 稻香 - 周杰伦</div>
                <div>3. 夜曲 - 周杰伦</div>
            </div>
        </div>
    );
}