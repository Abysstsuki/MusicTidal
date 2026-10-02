import type { ChatMessage, QueueSong, Song } from '@/types/music';

// Explicit visual-preview fixtures. Never sent to the music service.
export const previewSong: Song = {
  id: -1, name: 'Die For You', artist: 'Grabbitz',
  prcUrl: 'https://p1.music.126.net/7L4ROhfRFkJxroC3zbqPqw==/109951171796456806.jpg', duration: 212000,
};

export const previewQueue: QueueSong[] = [
  // One fixture intentionally has no artwork to demonstrate the neutral fallback.
  { id: -2, name: '夜曲', artist: '周杰伦', duration: 226000, prcUrl: '' },
  { id: -3, name: 'Lose Yourself', artist: 'Eminem', duration: 326000, prcUrl: 'https://p2.music.126.net/e97RIgPdyoJdQQS6Waw0VQ==/109951173366641451.jpg' },
  { id: -4, name: '海阔天空', artist: 'Beyond', duration: 324000, prcUrl: 'https://p1.music.126.net/iAwVf8ag_45csIUuh1wSZg==/109951168912558470.jpg' },
  { id: -5, name: '起风了', artist: '买辣椒也用券', duration: 325000, prcUrl: 'https://p2.music.126.net/diGAyEmpymX8G7JcnElncQ==/109951163699673355.jpg' },
  { id: -6, name: 'Afterglow', artist: 'Ed Sheeran', duration: 185000, prcUrl: 'https://p2.music.126.net/so0K1mvpfm-2Og4OqW5Aww==/109951165557605439.jpg' },
  { id: -7, name: '晚风', artist: '伍佰', duration: 248000, prcUrl: 'https://p1.music.126.net/DeKGN_wQwihLZRBcHSQ-EA==/109951171315893199.jpg' },
].map((song, index) => ({ ...song, instanceId: index + 1 }));

export const previewMessages: ChatMessage[] = [
  { username: 'Yuki', text: '这首好适合今晚。' },
  { username: 'Abyss', text: '一起听到最后吧。' },
];
export const previewUsers = ['Yuki', 'Abyss', '小岛', 'Mo', 'River', 'Lin', 'Kanade', 'Echo', '夏天', '鹿', 'Nana', '月'];
