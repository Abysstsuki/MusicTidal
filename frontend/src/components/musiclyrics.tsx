'use client';

import { useEffect, useState, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';

const rawLyric = `
[00:00.00] 作词 : Charles Ekhaus/Daniel Wells/Luke Olson/Michael James Tirabassi/Walter Kosner
[00:01.00] 作曲 : Charles Ekhaus/Daniel Wells/Luke Olson/Michael James Tirabassi/Walter Kosner
[00:13.56] I just need someone in my life to give it structure
[00:19.69] To handle all the selfish ways I'd spend my time without her
[00:26.07] You're everything I want, but I can't deal with all your lovers
[00:32.34] Saying I'm the one, but it's your actions that speak louder
[00:38.67] Giving me love when you are down and need another
[00:44.95] I've got to get away and let you go, I've got to get over
[00:51.24] But I love you so
[00:57.60] I love you so
[01:03.97] I love you so
[01:10.31] I love you so
[01:14.95] I'm gonna pack my things and leave you behind
[01:20.96] This feeling's old and I know that I've made up my mind
[01:27.27] I hope you feel what I felt when you shattered my soul
[01:33.53] 'Cause you were cruel and I'm a fool
[01:36.95] So please let me go
[01:41.85] But I love you so (please let me go)
[01:48.34] I love you so (please let me go)
[01:54.49] I love you so (please let me go)
[02:00.84] I love you so`;

function parseLyric(lyric: string) {
    const lines = lyric.split('\n');
    const pattern = /\[(\d{2}):(\d{2}\.\d{2})\](.*)/;
    const result = [];

    for (const line of lines) {
        const match = line.match(pattern);
        if (match) {
            const [, min, sec, text] = match;
            result.push({
                time: parseInt(min) * 60 + parseFloat(sec),
                text: text.trim(),
            });
        }
    }
    return result;
}

export default function MusicLyrics() {
    const lyrics = parseLyric(rawLyric);
    const [position, setPosition] = useState(67);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isUserScrolling, setIsUserScrolling] = useState(false);

    const currentIndex = lyrics.findIndex((line, index) => {
        const next = lyrics[index + 1];
        return position >= line.time && (!next || position < next.time);
    });

    // 用户滚动时，记录下来
    const handleScroll = () => {
        if (!isUserScrolling) {
            setIsUserScrolling(true);
        }
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
        }, 3000); // 用户停止滚动3秒后，允许播放器重新控制
    };

    useEffect(() => {
        if (containerRef.current) {
            const el = containerRef.current;
            el.addEventListener('scroll', handleScroll);
            return () => {
                el.removeEventListener('scroll', handleScroll);
            };
        }
    }, []);

    useEffect(() => {
        if (!isUserScrolling && containerRef.current) {
            const currentLine = containerRef.current.querySelector(`[data-idx="${currentIndex}"]`) as HTMLElement;
            if (currentLine) {
                currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentIndex, isUserScrolling]);

    return (
        <div className="w-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-132 w-160 max-w-full mx-auto relative z-10 py-10">
                <SimpleBar style={{ maxHeight: '100%', height: '100%' }} autoHide={true} scrollbarMaxSize={50}>
                    <div className="flex flex-col items-center space-y-10" ref={containerRef}>
                        {lyrics.map((line, index) => (
                            <p
                                key={index}
                                data-idx={index}
                                className={`transition-all duration-300 ${index === currentIndex
                                        ? 'text-white text-xl font-bold opacity-100 scale-110'
                                        : 'text-white text-lg opacity-60'
                                    } max-w-full w-[90%] text-center break-words`}
                            >
                                {line.text || '...'}
                            </p>
                        ))}
                    </div>
                </SimpleBar>
            </div>
        </div>
    );
}