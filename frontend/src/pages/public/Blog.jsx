import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [postsError, setPostsError] = useState(false);

  useEffect(() => {
    apiClient
      .get("/blog/")
      .then((response) => setPosts(response.data.results))
      .catch(() => setPostsError(true));
  }, []);

  return (
    <div className="px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Blog</h1>
      {postsError && (
        <p className="text-red-600">Couldn't load blog posts — please try again later.</p>
      )}
      <div className="grid gap-6">
        {posts.map((post) => (
          <article key={post.id} className="border-b pb-4">
            <h2 className="font-semibold text-lg">{post.title}</h2>
            <p className="text-gray-700 mt-1">{post.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
