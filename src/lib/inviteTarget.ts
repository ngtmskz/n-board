/**
 * 招待の欄で Enter を押したときに招待するメールアドレス。
 * メールアドレスを最後まで入力したときは、候補ではなく入力したとおりのアドレスにする
 * （部分一致で出た別の人や、名前をそのアドレスにしている人を招待してしまわないため）。
 * そうでなければ、候補が1人に絞れていればその人にする。
 */
export function inviteTarget(query: string, suggestions: { email: string }[]) {
  const q = query.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q)) return q;
  return suggestions.length === 1 ? suggestions[0].email : q;
}
