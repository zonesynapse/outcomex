import React from 'react';
import Layout from '../components/Layout';
import CIAConfigPage from '../components/CIAConfigPage';

const CIAConfiguration: React.FC = () => {
  return (
    <Layout title="CIA Configuration">
      <div className="py-8">
        <CIAConfigPage />
      </div>
    </Layout>
  );
};

export default CIAConfiguration;
