import styled from "styled-components";

const HudContainer = styled.div`
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
`;

type Props = {
  parseMs: number;
  nodes: number;
  edges: number;
  layoutMs: number;
};

export default function PerformanceHud({
  parseMs,
  nodes,
  edges,
  layoutMs,
}: Props) {
  return (
    <HudContainer data-testid="performance-hud">
      <div>parse: {parseMs.toFixed(1)}ms</div>
      <div>
        nodes: {nodes} edges: {edges}
      </div>
      <div>layout: {layoutMs.toFixed(1)}ms</div>
    </HudContainer>
  );
}
