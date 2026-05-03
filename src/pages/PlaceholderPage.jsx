import Layout from "../components/Layout";

export default function PlaceholderPage({ title }) {
  return (
    <Layout title={title}>
      <div className="p-10 text-center">
        <h2 className="text-2xl font-bold text-zinc-400 italic">
          {title} Page is under development...
        </h2>
      </div>
    </Layout>
  );
}
