// A master list's page with the old list's hearts (owner decision 19-11-2026): the ♥ heading's "Liked
// By" condition answered from the likes table first, then each row's likes for the viewer. Server only.
import "server-only";
import type { LikeKind } from "../like-rules";
import { likedByWhere, likesOf, NO_LIKES } from "../likes";
import type { ListPage, MasterListQuery } from "./list-query";

/** The list's "Liked By" pattern: an e-mail matches anywhere in the likers, as the heading's filter did. */
const pattern = (v: string) => (v.includes("%") ? v : `%${v}%`);

export async function masterListPage(kind: LikeKind, q: MasterListQuery, viewer: string, list: (q: MasterListQuery) => Promise<ListPage>): Promise<ListPage> {
  const idFilter = q.likedBy ? (await likedByWhere(kind, { op: "like", value: pattern(q.likedBy) })).id : undefined;
  const page = await list({ ...q, idFilter });
  const likes = await likesOf(kind, page.rows.map((r) => r.id), viewer);
  return { ...page, rows: page.rows.map((r) => ({ ...r, likes: likes[r.id] ?? NO_LIKES })) };
}
